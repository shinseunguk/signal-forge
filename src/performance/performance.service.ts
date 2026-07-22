import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MarketService } from '../market/market.service';
import { Market } from '../market/market.types';
import { PortfolioService } from '../portfolio/portfolio.service';
import {
  EfficacyBucket,
  PortfolioReport,
  SignalEfficacyReport,
} from './performance.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : parseFloat(String(value));
}

/**
 * 성과 분석 (기획서 §5.6). 이 시스템의 진짜 산출물:
 *  - portfolioReport: 봇이 돈을 벌었나
 *  - evaluateSignals / signalEfficacyReport: 내 시그널이 실제로 예측력이 있었나
 */
@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly portfolio: PortfolioService,
    private readonly market: MarketService,
  ) {}

  async portfolioReport(portfolioId: number): Promise<PortfolioReport> {
    const portfolioInfo = await this.portfolio.getById(portfolioId);
    const valuation = await this.portfolio.valuate(portfolioId);

    const { rows: snapRows } = await this.db.query<{ total_value: string }>(
      `SELECT total_value FROM portfolio_snapshot
       WHERE portfolio_id = $1 ORDER BY captured_at`,
      [portfolioId],
    );
    const navSeries = snapRows.map((r) => toNumber(r.total_value));

    const { rows: orderRows } = await this.db.query<{
      side: string;
      fee: string;
      tax: string;
    }>('SELECT side, fee, tax FROM paper_order WHERE portfolio_id = $1', [
      portfolioId,
    ]);

    const totalFriction = orderRows.reduce(
      (sum, o) => sum + toNumber(o.fee) + toNumber(o.tax),
      0,
    );
    const buyCount = orderRows.filter((o) => o.side === 'BUY').length;
    const sellCount = orderRows.filter((o) => o.side === 'SELL').length;

    return {
      portfolioId,
      initialCash: portfolioInfo.initialCash,
      currentValue: valuation.totalValue,
      returnPct: this.round(valuation.returnPct, 4),
      maxDrawdownPct: this.round(this.maxDrawdown(navSeries), 4),
      totalFriction: this.round(totalFriction, 4),
      orderCount: orderRows.length,
      buyCount,
      sellCount,
      dailyWinRate: this.round(this.dailyWinRate(navSeries), 2),
      snapshotCount: navSeries.length,
    };
  }

  /**
   * horizon 일 이상 경과한 시그널의 실제 수익률을 계산해 signal_outcome 에 저장한다(§6.4).
   * price_at_signal(발행 시점 근처 종가) → price_after(horizon 후 종가).
   */
  async evaluateSignals(horizonDays: number[], now = new Date()): Promise<void> {
    for (const horizon of horizonDays) {
      const cutoff = new Date(now.getTime() - horizon * MS_PER_DAY);
      const { rows } = await this.db.query<{
        id: string;
        symbol: string;
        market: string;
        published_at: Date;
      }>(
        `SELECT s.id, s.symbol, s.market, s.published_at
         FROM signal s
         WHERE s.published_at <= $1
           AND NOT EXISTS (
             SELECT 1 FROM signal_outcome o
             WHERE o.signal_id = s.id AND o.horizon_days = $2
           )`,
        [cutoff, horizon],
      );

      for (const sig of rows) {
        await this.evaluateOne(
          Number(sig.id),
          sig.symbol,
          sig.market as Market,
          new Date(sig.published_at),
          horizon,
        );
      }
      this.logger.log(`evaluateSignals horizon=${horizon}: ${rows.length}건 평가`);
    }
  }

  async signalEfficacyReport(): Promise<SignalEfficacyReport> {
    const byCategory = await this.aggregate('s.event_category');
    const bySentiment = await this.aggregate(
      `CASE
         WHEN s.sentiment_score < -0.3 THEN 'bearish'
         WHEN s.sentiment_score > 0.3 THEN 'bullish'
         ELSE 'neutral'
       END`,
    );
    return { byCategory, bySentiment };
  }

  // ── private ────────────────────────────────────────

  private async evaluateOne(
    signalId: number,
    symbol: string,
    market: Market,
    publishedAt: Date,
    horizon: number,
  ): Promise<void> {
    const priceAtSignal = await this.priceOn(symbol, market, publishedAt);
    if (priceAtSignal == null) {
      this.logger.debug(`signal ${signalId}: price_at_signal 없음 → 스킵`);
      return;
    }
    const target = new Date(publishedAt.getTime() + horizon * MS_PER_DAY);
    const priceAfter = await this.priceOn(symbol, market, target);
    const returnPct =
      priceAfter == null
        ? null
        : this.round((priceAfter / priceAtSignal - 1) * 100, 4);

    await this.db.query(
      `INSERT INTO signal_outcome
         (signal_id, horizon_days, price_at_signal, price_after, return_pct, evaluated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (signal_id, horizon_days) DO UPDATE
         SET price_after = EXCLUDED.price_after,
             return_pct = EXCLUDED.return_pct,
             evaluated_at = now()`,
      [signalId, horizon, priceAtSignal, priceAfter, returnPct],
    );
  }

  /** 해당 일자 이하에서 가장 가까운 캔들 종가. */
  private async priceOn(
    symbol: string,
    market: Market,
    date: Date,
  ): Promise<number | null> {
    const from = new Date(date.getTime() - 4 * MS_PER_DAY);
    const to = new Date(date.getTime() + MS_PER_DAY);
    const candles = await this.market.getCandles(symbol, market, from, to);
    if (candles.length === 0) return null;

    const eligible = candles.filter(
      (c) => c.timestamp.getTime() <= date.getTime(),
    );
    const chosen = eligible.length > 0 ? eligible[eligible.length - 1] : candles[0];
    return chosen.close;
  }

  private async aggregate(keyExpr: string): Promise<EfficacyBucket[]> {
    const { rows } = await this.db.query<{
      key: string;
      horizon_days: number;
      n: string;
      avg_ret: string | null;
      win: string | null;
    }>(
      `SELECT ${keyExpr} AS key,
              o.horizon_days,
              count(*) AS n,
              avg(o.return_pct) AS avg_ret,
              avg(CASE WHEN o.return_pct > 0 THEN 1.0 ELSE 0.0 END) * 100 AS win
       FROM signal_outcome o
       JOIN signal s ON s.id = o.signal_id
       WHERE o.return_pct IS NOT NULL
       GROUP BY key, o.horizon_days
       ORDER BY key, o.horizon_days`,
    );
    return rows.map((r) => ({
      key: r.key,
      horizonDays: Number(r.horizon_days),
      count: Number(r.n),
      avgReturnPct: this.round(toNumber(r.avg_ret ?? 0), 4),
      winRatePct: this.round(toNumber(r.win ?? 0), 2),
    }));
  }

  private maxDrawdown(series: number[]): number {
    let peak = -Infinity;
    let maxDd = 0;
    for (const v of series) {
      if (v > peak) peak = v;
      if (peak > 0) {
        const dd = (peak - v) / peak;
        if (dd > maxDd) maxDd = dd;
      }
    }
    return maxDd * 100;
  }

  private dailyWinRate(series: number[]): number {
    if (series.length < 2) return 0;
    let wins = 0;
    for (let i = 1; i < series.length; i += 1) {
      if (series[i] > series[i - 1]) wins += 1;
    }
    return (wins / (series.length - 1)) * 100;
  }

  private round(value: number, decimals: number): number {
    const f = 10 ** decimals;
    return Math.round(value * f) / f;
  }
}
