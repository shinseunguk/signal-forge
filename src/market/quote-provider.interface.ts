import { Candle, Market, Quote } from './market.types';

/** QuoteProvider 구현체를 주입하기 위한 DI 토큰. */
export const QUOTE_PROVIDER = 'QUOTE_PROVIDER';

/**
 * 시세 조회 추상화. **읽기 전용**이며 주문 관련 동작을 절대 포함하지 않는다(기획서 §1).
 * 구현체: MockQuoteProvider(기본, 결정론적) / TossQuoteProvider(실 API, 읽기 전용).
 */
export interface QuoteProvider {
  /** price_snapshot.source 에 기록될 출처 식별자. 예: 'toss' | 'mock'. */
  readonly source: string;

  /** 현재가 조회. */
  getPrice(symbol: string, market: Market): Promise<Quote>;

  /** 기간 캔들 조회 (성과 평가용 과거 가격). */
  getCandles(
    symbol: string,
    market: Market,
    from: Date,
    to: Date,
  ): Promise<Candle[]>;
}
