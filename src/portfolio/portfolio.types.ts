import { Market } from '../market/market.types';

/** 가상 계좌. */
export interface Portfolio {
  id: number;
  name: string;
  baseCurrency: string;
  initialCash: number;
  cashBalance: number;
  /** 펀딩 원 통화 금액 (예: 100,000,000 KRW). USD 계좌의 KRW 환산·환차익 리포트에 사용. */
  fundedAmount: number | null;
  fundedCurrency: string | null;
  initialFxRate: number | null;
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
