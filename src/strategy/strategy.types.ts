import { Market } from '../market/market.types';

export type StrategyActionType = 'BUY' | 'SELL' | 'HOLD';

/** 전략 엔진이 산출한 액션(실행 전 후보). */
export interface StrategyAction {
  action: StrategyActionType;
  symbol: string;
  market: Market;
  quantity?: number;
  orderAmount?: number;
  reason: string;
  signalId?: number;
}
