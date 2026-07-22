import { Injectable, Logger } from '@nestjs/common';
import { PaperExecutionService } from '../execution/paper-execution.service';
import { RiskGateService } from '../risk/risk-gate.service';
import { StrategyService } from './strategy.service';
import { StrategyAction } from './strategy.types';

export interface RunOutcome {
  action: StrategyAction['action'];
  symbol: string;
  status: 'executed' | 'skipped';
  orderId?: number;
  reason: string;
}

/**
 * 전략 실행 오케스트레이션: evaluate → 리스크 게이트 → 페이퍼 실행.
 * 시그널 → 액션 → (리스크) → 주문을 한 줄로 연결한다. 스케줄러가 호출한다(Phase 8).
 */
@Injectable()
export class StrategyRunnerService {
  private readonly logger = new Logger(StrategyRunnerService.name);

  constructor(
    private readonly strategy: StrategyService,
    private readonly risk: RiskGateService,
    private readonly execution: PaperExecutionService,
  ) {}

  async run(portfolioId: number, at: Date = new Date()): Promise<RunOutcome[]> {
    const actions = await this.strategy.evaluate(portfolioId, at);
    const outcomes: RunOutcome[] = [];

    for (const action of actions) {
      if (action.action === 'HOLD') {
        outcomes.push({
          action: 'HOLD',
          symbol: action.symbol,
          status: 'skipped',
          reason: action.reason,
        });
        continue;
      }

      if (action.action === 'BUY') {
        outcomes.push(await this.runBuy(portfolioId, action, at));
        continue;
      }

      outcomes.push(await this.runSell(portfolioId, action, at));
    }

    const executed = outcomes.filter((o) => o.status === 'executed').length;
    this.logger.log(
      `run(${portfolioId}): ${executed}/${outcomes.length} executed`,
    );
    return outcomes;
  }

  private async runBuy(
    portfolioId: number,
    action: StrategyAction,
    at: Date,
  ): Promise<RunOutcome> {
    const orderAmount = action.orderAmount as number;
    const decision = await this.risk.checkBuy({
      portfolioId,
      symbol: action.symbol,
      market: action.market,
      orderAmount,
      at,
    });
    if (!decision.allowed) {
      return {
        action: 'BUY',
        symbol: action.symbol,
        status: 'skipped',
        reason: `risk[${decision.gate}]: ${decision.reason}`,
      };
    }

    const order = await this.execution.paperBuy({
      portfolioId,
      symbol: action.symbol,
      market: action.market,
      orderAmount,
      signalId: action.signalId,
      idempotencyKey: this.idempotencyKey('buy', action.symbol, at),
      decidedAt: at,
      note: action.reason,
    });
    return {
      action: 'BUY',
      symbol: action.symbol,
      status: 'executed',
      orderId: order.id,
      reason: action.reason,
    };
  }

  private async runSell(
    portfolioId: number,
    action: StrategyAction,
    at: Date,
  ): Promise<RunOutcome> {
    // 매도(방어)도 휴장·비허용 세션에는 실행하지 않는다.
    const tradeable = await this.risk.isTradeable(action.market, at);
    if (!tradeable.allowed) {
      return {
        action: 'SELL',
        symbol: action.symbol,
        status: 'skipped',
        reason: `${tradeable.reason} → 매도 보류`,
      };
    }

    const order = await this.execution.paperSell({
      portfolioId,
      symbol: action.symbol,
      market: action.market,
      quantity: action.quantity as number,
      signalId: action.signalId,
      idempotencyKey: this.idempotencyKey('sell', action.symbol, at),
      decidedAt: at,
      note: action.reason,
    });
    return {
      action: 'SELL',
      symbol: action.symbol,
      status: 'executed',
      orderId: order.id,
      reason: action.reason,
    };
  }

  /** 같은 날 중복 주문 방지용 멱등 키. 예: buy-005930-20260722 */
  private idempotencyKey(side: string, symbol: string, at: Date): string {
    const y = at.getFullYear();
    const m = String(at.getMonth() + 1).padStart(2, '0');
    const d = String(at.getDate()).padStart(2, '0');
    return `${side}-${symbol}-${y}${m}${d}`;
  }
}
