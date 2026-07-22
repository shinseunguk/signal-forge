/** 거래소 구분. KRX(국내), US(미국). */
export type Market = 'KRX' | 'US';

/** 현재가 스냅샷. */
export interface Quote {
  symbol: string;
  market: Market;
  price: number;
  capturedAt: Date;
}

/** 일봉 캔들 (성과 평가용 과거 가격). */
export interface Candle {
  symbol: string;
  market: Market;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** 캔들의 기준 일자(장 종료 기준). */
  timestamp: Date;
}
