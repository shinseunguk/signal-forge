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
 * ⚠️ 관심 종목은 KRX(원화)만 둔다. US 종목은 환율 변환(orderAmount KRW ↔ USD 시세)이
 *    필요하므로 후속 과제로 남긴다.
 */
export const STRATEGY_V1: StrategyConfig = {
  version: 'v1',
  watchlist: [
    { symbol: '005930', market: 'KRX' }, // 삼성전자
    { symbol: '000660', market: 'KRX' }, // SK하이닉스
  ],
  buyOrderAmount: 1_000_000,
  badNews: {
    windowHours: 24,
    sentimentMax: -0.5,
    confidenceMin: 0.6,
  },
};
