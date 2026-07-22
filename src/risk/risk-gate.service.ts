import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { MarketService } from '../market/market.service';
import { Market } from '../market/market.types';
import {
  ALLOWED_SESSIONS,
  MarketSessionService,
} from '../market/market-session';
import { PortfolioService } from '../portfolio/portfolio.service';
import { ALLOWED, CheckBuyInput, RiskDecision } from './risk.types';

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : parseFloat(String(value));
}

/**
 * 매수 실행 전 리스크 게이트 (기획서 §6.3).
 * 순서대로 검사하여 첫 위반에서 거부한다.
 *  1) 휴장일 게이팅  2) 일일 손실 한도  3) 종목당 비중 상한
 * (예수금 체크·멱등성은 실행 계층에서 이미 강제)
 */
@Injectable()
export class RiskGateService {
  private readonly logger = new Logger(RiskGateService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly portfolio: PortfolioService,
    private readonly market: MarketService,
    private readonly session: MarketSessionService,
    private readonly config: ConfigService,
  ) {}

  async checkBuy(input: CheckBuyInput): Promise<RiskDecision> {
    const at = input.at ?? new Date();

    const tradeable = await this.isTradeable(input.market, at);
    if (!tradeable.allowed) return tradeable;

    const lossGate = await this.checkDailyLoss(input.portfolioId, at);
    if (!lossGate.allowed) return lossGate;

    const weightGate = await this.checkPositionWeight(input);
    if (!weightGate.allowed) return weightGate;

    return ALLOWED;
  }

  /**
   * 매매 가능 여부 = 개장일(캘린더) AND 허용 세션(기본 본장). 매수·매도 공통 게이트.
   */
  async isTradeable(market: Market, at: Date): Promise<RiskDecision> {
    const open = await this.isMarketOpen(market, at);
    if (!open) {
      return this.deny('market_closed', `${market} 휴장일에는 매매하지 않습니다.`);
    }
    const current = this.session.getSession(market, at);
    if (!ALLOWED_SESSIONS[market].includes(current)) {
      return this.deny(
        'market_session',
        `${market} ${current} 세션에는 매매하지 않습니다(허용: ${ALLOWED_SESSIONS[market].join(',')}).`,
      );
    }
    return ALLOWED;
  }

  /**
   * 개장 여부. market_calendar 에 해당 일자 레코드가 있으면 그것을 따르고,
   * 없으면 주말=휴장, 평일=개장으로 fallback 한다.
   */
  async isMarketOpen(market: Market, date: Date): Promise<boolean> {
    const sessionDate = this.toDateString(date);
    const { rows } = await this.db.query<{ is_open: boolean }>(
      'SELECT is_open FROM market_calendar WHERE market = $1 AND session_date = $2',
      [market, sessionDate],
    );
    if (rows.length > 0) {
      return rows[0].is_open;
    }
    const day = date.getDay(); // 0=일, 6=토
    return day !== 0 && day !== 6;
  }

  /** 당일 손실이 시드의 X% 에 도달하면 신규 매수를 차단한다. */
  private async checkDailyLoss(
    portfolioId: number,
    at: Date,
  ): Promise<RiskDecision> {
    const limitPct = this.config.get<number>('risk.dailyLossLimitPct') ?? 3;
    const portfolio = await this.portfolio.getById(portfolioId);
    const baseline = await this.getBaselineNav(
      portfolioId,
      at,
      portfolio.initialCash,
    );
    const current = await this.portfolio.valuate(portfolioId);

    const dailyLoss = baseline - current.totalValue; // 양수면 손실
    const limitAmount = (portfolio.initialCash * limitPct) / 100;
    if (dailyLoss >= limitAmount) {
      return this.deny(
        'daily_loss_limit',
        `당일 손실 ${dailyLoss.toFixed(0)} 이 한도 ${limitAmount.toFixed(0)}(시드 ${limitPct}%) 에 도달했습니다.`,
      );
    }
    return ALLOWED;
  }

  /** 매수 후 단일 종목 평가액이 총자산의 Y% 를 초과하면 거부한다. */
  private async checkPositionWeight(
    input: CheckBuyInput,
  ): Promise<RiskDecision> {
    const maxPct = this.config.get<number>('risk.maxPositionWeightPct') ?? 20;
    const valuation = await this.portfolio.valuate(input.portfolioId);
    const totalValue = valuation.totalValue;
    if (totalValue <= 0) return ALLOWED;

    const positions = await this.portfolio.getPositions(input.portfolioId);
    const held = positions.find((p) => p.symbol === input.symbol);
    let existingValue = 0;
    if (held && held.quantity !== 0) {
      const quote = await this.market.getPrice(input.symbol, input.market);
      existingValue = held.quantity * quote.price;
    }

    const projectedValue = existingValue + input.orderAmount;
    const projectedWeight = (projectedValue / totalValue) * 100;
    if (projectedWeight > maxPct) {
      return this.deny(
        'position_weight',
        `${input.symbol} 매수 후 비중 ${projectedWeight.toFixed(1)}% 이 상한 ${maxPct}% 을 초과합니다.`,
      );
    }
    return ALLOWED;
  }

  private async getBaselineNav(
    portfolioId: number,
    at: Date,
    fallback: number,
  ): Promise<number> {
    const startOfDay = new Date(at);
    startOfDay.setHours(0, 0, 0, 0);
    const { rows } = await this.db.query<{ total_value: string }>(
      `SELECT total_value FROM portfolio_snapshot
       WHERE portfolio_id = $1 AND captured_at < $2
       ORDER BY captured_at DESC LIMIT 1`,
      [portfolioId, startOfDay],
    );
    return rows.length > 0 ? toNumber(rows[0].total_value) : fallback;
  }

  private deny(gate: RiskDecision['gate'], reason: string): RiskDecision {
    this.logger.warn(`risk deny [${gate}] ${reason}`);
    return { allowed: false, gate, reason };
  }

  private toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
