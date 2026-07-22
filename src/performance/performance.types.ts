/** 펀딩 통화 환산·환차익 (USD 계좌를 KRW 로 펀딩한 경우). */
export interface FxReport {
  fundedCurrency: string; // 예: 'KRW'
  fundedAmount: number; // 예: 100,000,000 KRW
  initialFxRate: number; // 펀딩 시점 환율
  currentFxRate: number; // 현재 환율
  currentValueInFunded: number; // 현재 평가액의 펀딩 통화 환산
  returnPctInFunded: number; // 펀딩 통화 기준 수익률
  stockPnl: number; // 주가손익 (펀딩 통화 환산)
  fxPnl: number; // 환차익 (펀딩 통화)
}

/** 포트폴리오 성과 리포트. */
export interface PortfolioReport {
  portfolioId: number;
  baseCurrency: string;
  initialCash: number; // base 통화
  currentValue: number; // base 통화
  returnPct: number; // base 통화 기준 누적 수익률
  maxDrawdownPct: number; // NAV 스냅샷 기준 최대 낙폭
  totalFriction: number; // 수수료+세금 총합 (base 통화)
  orderCount: number;
  buyCount: number;
  sellCount: number;
  dailyWinRate: number; // 상승 마감일 / 전체 스냅샷 구간
  snapshotCount: number;
  /** 펀딩 통화 환산·환차익 (해당 시). */
  fx: FxReport | null;
}

/** 예측력 집계 한 칸(카테고리 또는 감성 구간 × horizon). */
export interface EfficacyBucket {
  key: string;
  horizonDays: number;
  count: number;
  avgReturnPct: number;
  winRatePct: number; // return_pct > 0 비율
}

export interface SignalEfficacyReport {
  byCategory: EfficacyBucket[];
  bySentiment: EfficacyBucket[];
}

/** 매매일지 한 줄. */
export interface JournalEntry {
  side: 'BUY' | 'SELL';
  symbol: string;
  market: string;
  quantity: number;
  fillPrice: number;
  fee: number;
  tax: number;
  netCashFlow: number;
  decidedAt: Date;
  note: string | null;
}
