import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Market } from '../market/market.types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { STRATEGY_V1, StrategyConfig } from './strategy.config';
import { StrategyAction } from './strategy.types';

interface BadNewsRow {
  symbol: string;
  market: string;
  id: string;
}

/**
 * 결정론적 규칙 엔진 (기획서 §5.5). LLM 아님.
 * 시그널·포트폴리오 상태를 받아 액션 목록을 산출한다(실행/게이트는 Runner 담당).
 */
@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);
  private readonly config: StrategyConfig = STRATEGY_V1;

  constructor(
    private readonly db: DatabaseService,
    private readonly portfolio: PortfolioService,
  ) {}

  async evaluate(portfolioId: number, at: Date = new Date()): Promise<StrategyAction[]> {
    const blacklist = await this.getBadNews(at);
    const positions = await this.portfolio.getPositions(portfolioId);
    const actions: StrategyAction[] = [];

    // 1) 악재 필터: 보유 중인 악재 종목은 매도 후보.
    for (const pos of positions) {
      const bad = blacklist.get(pos.symbol);
      if (bad && pos.quantity > 0) {
        actions.push({
          action: 'SELL',
          symbol: pos.symbol,
          market: pos.market,
          quantity: pos.quantity,
          reason: `악재 시그널 감지 → 보유 청산`,
          signalId: bad.signalId,
        });
      }
    }

    // 2) 적립 매수: 관심 종목 중 악재가 아닌 종목만.
    for (const item of this.config.watchlist) {
      const bad = blacklist.get(item.symbol);
      if (bad) {
        actions.push({
          action: 'HOLD',
          symbol: item.symbol,
          market: item.market,
          reason: '악재 필터: 신규 매수 금지',
          signalId: bad.signalId,
        });
        continue;
      }
      actions.push({
        action: 'BUY',
        symbol: item.symbol,
        market: item.market,
        orderAmount: this.config.buyOrderAmount,
        reason: `적립 매수(${this.config.version})`,
      });
    }

    this.logger.log(
      `evaluate(${portfolioId}): ${actions.length} actions (blacklist ${blacklist.size})`,
    );
    return actions;
  }

  /** 최근 windowHours 내 악재 시그널 종목 → 대표 signalId 맵. */
  private async getBadNews(
    at: Date,
  ): Promise<Map<string, { market: Market; signalId: number }>> {
    const { windowHours, sentimentMax, confidenceMin } = this.config.badNews;
    const windowStart = new Date(at.getTime() - windowHours * 3600 * 1000);

    const { rows } = await this.db.query<BadNewsRow>(
      `SELECT DISTINCT ON (symbol) symbol, market, id
       FROM signal
       WHERE published_at >= $1
         AND sentiment_score < $2
         AND confidence > $3
       ORDER BY symbol, published_at DESC`,
      [windowStart, sentimentMax, confidenceMin],
    );

    const map = new Map<string, { market: Market; signalId: number }>();
    for (const row of rows) {
      map.set(row.symbol, {
        market: row.market as Market,
        signalId: Number(row.id),
      });
    }
    return map;
  }
}
