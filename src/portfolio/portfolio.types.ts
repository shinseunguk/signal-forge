import { Market } from '../market/market.types';

/** 가상 계좌. */
export interface Portfolio {
  id: number;
  name: string;
  baseCurrency: string;
  initialCash: number;
  cashBalance: number;
}

/** 보유 포지션. */
export interface Position {
  id: number;
  portfolioId: number;
  symbol: string;
  market: Market;
  quantity: number;
  avgPrice: number;
}

/** 포트폴리오 밸류에이션 결과 (기획서 §6.1). */
export interface Valuation {
  totalValue: number;
  cashBalance: number;
  positionsValue: number;
  returnPct: number;
}
