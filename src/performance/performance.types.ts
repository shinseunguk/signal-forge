/** 포트폴리오 성과 리포트. */
export interface PortfolioReport {
  portfolioId: number;
  initialCash: number;
  currentValue: number;
  returnPct: number; // 초기 시드 대비 누적 수익률
  maxDrawdownPct: number; // NAV 스냅샷 기준 최대 낙폭
  totalFriction: number; // 수수료+세금 총합
  orderCount: number;
  buyCount: number;
  sellCount: number;
  dailyWinRate: number; // 상승 마감일 / 전체 스냅샷 구간
  snapshotCount: number;
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
