import { Market } from '../market/market.types';

/** CalendarProvider 구현체를 주입하기 위한 DI 토큰. */
export const CALENDAR_PROVIDER = 'CALENDAR_PROVIDER';

/** 특정 거래소의 하루 세션 정보 (market_calendar 한 행에 대응). */
export interface MarketDay {
  market: Market;
  /** 세션 일자 (YYYY-MM-DD, 거래소 현지 기준). */
  sessionDate: string;
  /** 개장 여부. 완전 휴장이면 false, 단축장은 true. */
  isOpen: boolean;
}

/**
 * 휴장일 캘린더 조회 추상화. **읽기 전용**이며 주문 관련 동작을 포함하지 않는다(기획서 §1).
 * 구현체: MockCalendarProvider(기본, 평일 규칙) / FinnhubCalendarProvider(실 API, 공휴일 반영).
 */
export interface CalendarProvider {
  /** 데이터 출처 식별자. 예: 'finnhub' | 'mock'. */
  readonly source: string;

  /** 지정 기간 [from, to] 의 일자별 개장 여부를 산출한다. */
  getSessions(market: Market, from: Date, to: Date): Promise<MarketDay[]>;
}
