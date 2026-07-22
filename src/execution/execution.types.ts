import { Market } from '../market/market.types';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';

/** 페이퍼 주문 (실제 주문 아님 — 기록 전용). */
export interface PaperOrder {
  id: number;
  portfolioId: number;
  symbol: string;
  market: Market;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  fillPrice: number;
  grossAmount: number;
  fee: number;
  tax: number;
  netCashFlow: number;
  signalId: number | null;
  idempotencyKey: string | null;
  note: string | null;
  decidedAt: Date;
  createdAt: Date;
}

export interface PaperBuyInput {
  portfolioId: number;
  symbol: string;
  market: Market;
  /** quantity 또는 orderAmount 중 하나만 지정한다. */
  quantity?: number;
  /** 금액 기반 매수 예산(수수료 포함). */
  orderAmount?: number;
  signalId?: number;
  idempotencyKey: string;
  decidedAt: Date;
  note?: string;
}

export interface PaperSellInput {
  portfolioId: number;
  symbol: string;
  market: Market;
  quantity: number;
  signalId?: number;
  idempotencyKey: string;
  decidedAt: Date;
  note?: string;
}
