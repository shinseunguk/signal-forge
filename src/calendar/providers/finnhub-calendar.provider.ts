import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Market } from '../../market/market.types';
import { CalendarProvider, MarketDay } from '../calendar-provider.interface';
import { eachDay, isWeekend, toDateString } from '../calendar.util';

/** Finnhub /stock/market-holiday 응답 한 건. */
interface FinnhubHoliday {
  eventName: string;
  atDate: string; // 'YYYY-MM-DD'
  /** 빈 문자열이면 완전 휴장, "09:30-13:00" 등이면 단축장(거래 있음). */
  tradingHour: string;
}

interface FinnhubHolidayResponse {
  data?: FinnhubHoliday[];
}

/** Finnhub 거래소 코드 매핑. 실 API 연동은 US 만 지원, 그 외는 평일 규칙 fallback. */
const EXCHANGE_CODE: Partial<Record<Market, string>> = {
  US: 'US',
};

const REQUEST_TIMEOUT_MS = 12_000;

/**
 * Finnhub 기반 실 캘린더 제공자 (읽기 전용).
 * /stock/market-holiday 로 공휴일을 받아 완전 휴장일을 계산한다.
 * US 외 시장은 평일=개장 규칙으로 대체한다.
 */
@Injectable()
export class FinnhubCalendarProvider implements CalendarProvider {
  readonly source = 'finnhub';
  private readonly logger = new Logger(FinnhubCalendarProvider.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('calendar.finnhubBaseUrl') ??
      'https://finnhub.io/api/v1';
  }

  async getSessions(
    market: Market,
    from: Date,
    to: Date,
  ): Promise<MarketDay[]> {
    const exchange = EXCHANGE_CODE[market];
    if (!exchange) {
      // 실 API 미지원 시장 → 평일 규칙으로 대체.
      return this.weekdaySessions(market, from, to);
    }

    const closedDates = await this.fetchFullCloseDates(exchange);
    return eachDay(from, to).map((date) => {
      const sessionDate = toDateString(date);
      return {
        market,
        sessionDate,
        isOpen: !isWeekend(date) && !closedDates.has(sessionDate),
      };
    });
  }

  /** 완전 휴장(거래시간 없음) 일자 집합을 조회한다. */
  private async fetchFullCloseDates(exchange: string): Promise<Set<string>> {
    const apiKey = this.config.get<string>('calendar.finnhubApiKey');
    if (!apiKey) {
      throw new Error('FINNHUB_API_KEY 가 설정되지 않았습니다.');
    }

    const url = `${this.baseUrl}/stock/market-holiday?exchange=${exchange}&token=${apiKey}`;
    const body = await this.getJson(url);

    const closed = new Set<string>();
    for (const holiday of body.data ?? []) {
      // tradingHour 가 비어 있으면 완전 휴장. 단축장은 개장으로 둔다.
      if (holiday.tradingHour.trim() === '') {
        closed.add(holiday.atDate);
      }
    }
    this.logger.log(
      `finnhub holidays(${exchange}): ${closed.size} full-close days`,
    );
    return closed;
  }

  private async getJson(url: string): Promise<FinnhubHolidayResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Finnhub 응답 오류: HTTP ${response.status}`);
      }
      return (await response.json()) as FinnhubHolidayResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  private weekdaySessions(market: Market, from: Date, to: Date): MarketDay[] {
    return eachDay(from, to).map((date) => ({
      market,
      sessionDate: toDateString(date),
      isOpen: !isWeekend(date),
    }));
  }
}
