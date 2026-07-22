import { Market } from '../market/market.types';

/** 리스크 게이트 판정 결과. */
export interface RiskDecision {
  allowed: boolean;
  /** 거부된 게이트 식별자 (allowed=false 일 때). */
  gate?:
    | 'market_closed'
    | 'market_session'
    | 'daily_loss_limit'
    | 'position_weight';
  reason?: string;
}

/** 매수 게이트 검사 입력. */
export interface CheckBuyInput {
  portfolioId: number;
  symbol: string;
  market: Market;
  /** 이번 매수에 투입될 예상 금액(현금). */
  orderAmount: number;
  /** 판정 기준 시각 (기본 now). */
  at?: Date;
}

export const ALLOWED: RiskDecision = { allowed: true };
