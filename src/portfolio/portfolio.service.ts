import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MarketService } from '../market/market.service';
import { Market } from '../market/market.types';
import { Portfolio, Position, Valuation } from './portfolio.types';

/** pg 는 NUMERIC/BIGINT 를 문자열로 반환한다 → number 로 변환. */
function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : parseFloat(String(value));
}

interface PortfolioRow {
  id: string;
  name: string;
  base_currency: string;
  initial_cash: string;
  cash_balance: string;
  funded_amount: string | null;
  funded_currency: string | null;
  initial_fx_rate: string | null;
}

interface PositionRow {
  id: string;
  portfolio_id: string;
  symbol: string;
  market: string;
  quantity: string;
  avg_price: string;
}

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly market: MarketService,
  ) {}

  /** 초기 시드로 포트폴리오를 생성한다 (현금 잔고 = 초기 시드). */
  async create(name: string, initialCash: number): Promise<Portfolio> {
    const { rows } = await this.db.query<PortfolioRow>(
      `INSERT INTO portfolio (name, base_currency, initial_cash, cash_balance)
       VALUES ($1, 'KRW', $2, $2)
       RETURNING *`,
      [name, initialCash],
    );
    return this.mapPortfolio(rows[0]);
  }

  async getById(portfolioId: number): Promise<Portfolio> {
    const { rows } = await this.db.query<PortfolioRow>(
      'SELECT * FROM portfolio WHERE id = $1',
      [portfolioId],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`portfolio ${portfolioId} 를 찾을 수 없습니다.`);
    }
    return this.mapPortfolio(rows[0]);
  }

  async getPositions(portfolioId: number): Promise<Position[]> {
    const { rows } = await this.db.query<PositionRow>(
      'SELECT * FROM position WHERE portfolio_id = $1 ORDER BY symbol',
      [portfolioId],
    );
    return rows.map((row) => this.mapPosition(row));
  }

  /**
   * 총 평가액 = cash_balance + Σ(position.quantity × 현재가) (기획서 §6.1).
   * 누적수익률(%) = (총평가액 - initial_cash) / initial_cash × 100.
   */
  async valuate(portfolioId: number): Promise<Valuation> {
    const portfolio = await this.getById(portfolioId);
    const positions = await this.getPositions(portfolioId);

    const held = positions.filter((p) => p.quantity !== 0);
    const marketValues = await Promise.all(
      held.map(async (p) => {
        const quote = await this.market.getPrice(p.symbol, p.market);
        return p.quantity * quote.price;
      }),
    );
    const positionsValue = marketValues.reduce((sum, v) => sum + v, 0);

    const totalValue = portfolio.cashBalance + positionsValue;
    const returnPct =
      ((totalValue - portfolio.initialCash) / portfolio.initialCash) * 100;

    return {
      totalValue,
      cashBalance: portfolio.cashBalance,
      positionsValue,
      returnPct,
    };
  }

  /** 현재 밸류에이션을 portfolio_snapshot 에 기록한다 (일일 NAV). */
  async snapshot(portfolioId: number): Promise<void> {
    const v = await this.valuate(portfolioId);
    await this.db.query(
      `INSERT INTO portfolio_snapshot
         (portfolio_id, total_value, cash_balance, positions_value, return_pct)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        portfolioId,
        v.totalValue,
        v.cashBalance,
        v.positionsValue,
        v.returnPct,
      ],
    );
    this.logger.log(
      `snapshot portfolio ${portfolioId}: NAV=${v.totalValue} (${v.returnPct.toFixed(2)}%)`,
    );
  }

  private mapPortfolio(row: PortfolioRow): Portfolio {
    return {
      id: toNumber(row.id),
      name: row.name,
      baseCurrency: row.base_currency,
      initialCash: toNumber(row.initial_cash),
      cashBalance: toNumber(row.cash_balance),
      fundedAmount: row.funded_amount == null ? null : toNumber(row.funded_amount),
      fundedCurrency: row.funded_currency,
      initialFxRate:
        row.initial_fx_rate == null ? null : toNumber(row.initial_fx_rate),
    };
  }

  private mapPosition(row: PositionRow): Position {
    return {
      id: toNumber(row.id),
      portfolioId: toNumber(row.portfolio_id),
      symbol: row.symbol,
      market: row.market as Market,
      quantity: toNumber(row.quantity),
      avgPrice: toNumber(row.avg_price),
    };
  }
}
