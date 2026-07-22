import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { MarketService } from '../market/market.service';
import { Market } from '../market/market.types';
import { FEES, SELL_TAX, SLIPPAGE } from './execution.constants';
import {
  OrderSide,
  PaperBuyInput,
  PaperOrder,
  PaperSellInput,
} from './execution.types';

interface PaperOrderRow {
  id: string;
  portfolio_id: string;
  symbol: string;
  market: string;
  side: string;
  order_type: string;
  quantity: string;
  fill_price: string;
  gross_amount: string;
  fee: string;
  tax: string;
  net_cash_flow: string;
  signal_id: string | null;
  idempotency_key: string | null;
  note: string | null;
  decided_at: Date;
  created_at: Date;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : parseFloat(String(value));
}

/** 금액/가격은 소수 4자리, 수량은 6자리로 정규화(스키마 스케일과 정합). */
function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}
function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/**
 * 페이퍼 주문 실행 (기록 전용).
 * 실제 증권 API 호출은 없다(§1). 현금·포지션은 단일 DB 트랜잭션으로만 갱신한다.
 */
@Injectable()
export class PaperExecutionService {
  private readonly logger = new Logger(PaperExecutionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly market: MarketService,
  ) {}

  /** 페이퍼 매수. quantity 또는 orderAmount(금액 기반) 중 하나로 지정. */
  async paperBuy(input: PaperBuyInput): Promise<PaperOrder> {
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      this.logger.warn(
        `idempotencyKey 중복 → 기존 주문 반환: ${input.idempotencyKey}`,
      );
      return existing;
    }

    if ((input.quantity == null) === (input.orderAmount == null)) {
      throw new BadRequestException(
        'quantity 또는 orderAmount 중 정확히 하나만 지정해야 합니다.',
      );
    }

    const quote = await this.market.getPrice(input.symbol, input.market);
    const fillPrice = round4(quote.price * (1 + SLIPPAGE));
    const commission = FEES[input.market].commission;

    const quantity = this.resolveBuyQuantity(input, fillPrice, commission);
    if (quantity <= 0) {
      throw new BadRequestException(
        '주문 수량이 0 이하입니다(예산 부족 또는 잘못된 입력).',
      );
    }

    const gross = round4(quantity * fillPrice);
    const fee = round4(gross * commission);
    const netCashFlow = round4(-(gross + fee));

    return this.db.withTransaction(async (client) => {
      const cash = await this.lockCashBalance(client, input.portfolioId);
      const required = gross + fee;
      if (cash < required) {
        throw new BadRequestException(
          `예수금 부족: 필요 ${required}, 보유 ${cash}`,
        );
      }

      await client.query(
        'UPDATE portfolio SET cash_balance = cash_balance + $1, updated_at = now() WHERE id = $2',
        [netCashFlow, input.portfolioId],
      );
      await this.applyBuyPosition(client, input, quantity, gross);

      return this.insertOrder(client, {
        input,
        side: 'BUY',
        quantity,
        fillPrice,
        gross,
        fee,
        tax: 0,
        netCashFlow,
      });
    });
  }

  /** 페이퍼 매도. 보유 수량 범위 내에서만 허용. */
  async paperSell(input: PaperSellInput): Promise<PaperOrder> {
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      this.logger.warn(
        `idempotencyKey 중복 → 기존 주문 반환: ${input.idempotencyKey}`,
      );
      return existing;
    }

    if (input.quantity <= 0) {
      throw new BadRequestException('매도 수량은 0보다 커야 합니다.');
    }

    const quote = await this.market.getPrice(input.symbol, input.market);
    const fillPrice = round4(quote.price * (1 - SLIPPAGE));
    const commission = FEES[input.market].commission;
    const sellTax = SELL_TAX[input.market];

    const gross = round4(input.quantity * fillPrice);
    const fee = round4(gross * commission);
    const tax = round4(gross * sellTax);
    const netCashFlow = round4(gross - fee - tax);

    return this.db.withTransaction(async (client) => {
      const held = await this.lockPositionQuantity(
        client,
        input.portfolioId,
        input.symbol,
      );
      if (held < input.quantity) {
        throw new BadRequestException(
          `보유 수량 부족: 보유 ${held}, 매도 ${input.quantity}`,
        );
      }

      await client.query(
        'UPDATE portfolio SET cash_balance = cash_balance + $1, updated_at = now() WHERE id = $2',
        [netCashFlow, input.portfolioId],
      );
      await client.query(
        `UPDATE position
           SET quantity = quantity - $1, updated_at = now()
         WHERE portfolio_id = $2 AND symbol = $3`,
        [input.quantity, input.portfolioId, input.symbol],
      );

      return this.insertOrder(client, {
        input,
        side: 'SELL',
        quantity: input.quantity,
        fillPrice,
        gross,
        fee,
        tax,
        netCashFlow,
      });
    });
  }

  // ── private ────────────────────────────────────────

  private resolveBuyQuantity(
    input: PaperBuyInput,
    fillPrice: number,
    commission: number,
  ): number {
    if (input.quantity != null) {
      return input.market === 'KRX'
        ? Math.floor(input.quantity)
        : round6(input.quantity);
    }
    // 금액 기반: 예산은 수수료를 포함한 총 현금 지출 한도.
    const budget = input.orderAmount as number;
    const unitCost = fillPrice * (1 + commission);
    const rawQty = budget / unitCost;
    return input.market === 'KRX' ? Math.floor(rawQty) : round6(rawQty);
  }

  private async lockCashBalance(
    client: PoolClient,
    portfolioId: number,
  ): Promise<number> {
    const { rows } = await client.query<{ cash_balance: string }>(
      'SELECT cash_balance FROM portfolio WHERE id = $1 FOR UPDATE',
      [portfolioId],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`portfolio ${portfolioId} 를 찾을 수 없습니다.`);
    }
    return toNumber(rows[0].cash_balance);
  }

  private async lockPositionQuantity(
    client: PoolClient,
    portfolioId: number,
    symbol: string,
  ): Promise<number> {
    const { rows } = await client.query<{ quantity: string }>(
      'SELECT quantity FROM position WHERE portfolio_id = $1 AND symbol = $2 FOR UPDATE',
      [portfolioId, symbol],
    );
    return rows.length === 0 ? 0 : toNumber(rows[0].quantity);
  }

  /** 매수 체결분을 포지션에 반영(가중평균 체결가 갱신). */
  private async applyBuyPosition(
    client: PoolClient,
    input: PaperBuyInput,
    quantity: number,
    gross: number,
  ): Promise<void> {
    const { rows } = await client.query<{
      quantity: string;
      avg_price: string;
    }>(
      'SELECT quantity, avg_price FROM position WHERE portfolio_id = $1 AND symbol = $2 FOR UPDATE',
      [input.portfolioId, input.symbol],
    );

    if (rows.length === 0) {
      const avgPrice = round4(gross / quantity);
      await client.query(
        `INSERT INTO position (portfolio_id, symbol, market, quantity, avg_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.portfolioId, input.symbol, input.market, quantity, avgPrice],
      );
      return;
    }

    const oldQty = toNumber(rows[0].quantity);
    const oldAvg = toNumber(rows[0].avg_price);
    const newQty = round6(oldQty + quantity);
    const newAvg = round4((oldQty * oldAvg + gross) / newQty);
    await client.query(
      `UPDATE position
         SET quantity = $1, avg_price = $2, market = $3, updated_at = now()
       WHERE portfolio_id = $4 AND symbol = $5`,
      [newQty, newAvg, input.market, input.portfolioId, input.symbol],
    );
  }

  private async insertOrder(
    client: PoolClient,
    args: {
      input: PaperBuyInput | PaperSellInput;
      side: OrderSide;
      quantity: number;
      fillPrice: number;
      gross: number;
      fee: number;
      tax: number;
      netCashFlow: number;
    },
  ): Promise<PaperOrder> {
    const { input, side, quantity, fillPrice, gross, fee, tax, netCashFlow } =
      args;
    const { rows } = await client.query<PaperOrderRow>(
      `INSERT INTO paper_order
         (portfolio_id, symbol, market, side, order_type, quantity, fill_price,
          gross_amount, fee, tax, net_cash_flow, signal_id, idempotency_key, note, decided_at)
       VALUES ($1,$2,$3,$4,'MARKET',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        input.portfolioId,
        input.symbol,
        input.market,
        side,
        quantity,
        fillPrice,
        gross,
        fee,
        tax,
        netCashFlow,
        input.signalId ?? null,
        input.idempotencyKey,
        input.note ?? null,
        input.decidedAt,
      ],
    );
    return this.mapOrder(rows[0]);
  }

  private async findByIdempotencyKey(
    key: string,
  ): Promise<PaperOrder | null> {
    const { rows } = await this.db.query<PaperOrderRow>(
      'SELECT * FROM paper_order WHERE idempotency_key = $1',
      [key],
    );
    return rows.length === 0 ? null : this.mapOrder(rows[0]);
  }

  private mapOrder(row: PaperOrderRow): PaperOrder {
    return {
      id: toNumber(row.id),
      portfolioId: toNumber(row.portfolio_id),
      symbol: row.symbol,
      market: row.market as Market,
      side: row.side as OrderSide,
      orderType: row.order_type as PaperOrder['orderType'],
      quantity: toNumber(row.quantity),
      fillPrice: toNumber(row.fill_price),
      grossAmount: toNumber(row.gross_amount),
      fee: toNumber(row.fee),
      tax: toNumber(row.tax),
      netCashFlow: toNumber(row.net_cash_flow),
      signalId: row.signal_id == null ? null : toNumber(row.signal_id),
      idempotencyKey: row.idempotency_key,
      note: row.note,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
    };
  }
}
