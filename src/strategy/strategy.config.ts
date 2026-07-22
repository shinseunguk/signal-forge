import { Market } from '../market/market.types';

export interface WatchItem {
  symbol: string;
  market: Market;
}

/** 전략 파라미터 (버전 관리·튜닝 대상). 백테스트 시 이 상수를 교체한다. */
export interface StrategyConfig {
  version: string;
  /** 적립 매수 대상 관심 종목. */
  watchlist: WatchItem[];
  /** 1회 적립 매수 금액(현금). */
  buyOrderAmount: number;
  /** 악재 필터 파라미터. */
  badNews: {
    windowHours: number;
    sentimentMax: number; // 이 값 미만이면 악재
    confidenceMin: number; // 이 값 초과여야 유효
  };
}

/**
 * v1 규칙 파라미터.
 * USD 네이티브 계좌 — 미국 종목만 매매하며 buyOrderAmount 는 USD 단위이다.
 */
export const STRATEGY_V1: StrategyConfig = {
  version: 'v1',
  watchlist: [
    { symbol: 'AAPL', market: 'US' },
    { symbol: 'MSFT', market: 'US' },
    { symbol: 'NVDA', market: 'US' },
  ],
  buyOrderAmount: 1_000, // USD
  badNews: {
    windowHours: 24,
    sentimentMax: -0.5,
    confidenceMin: 0.6,
  },
};
