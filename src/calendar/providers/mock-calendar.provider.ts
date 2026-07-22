import { Injectable } from '@nestjs/common';
import { Market } from '../../market/market.types';
import { CalendarProvider, MarketDay } from '../calendar-provider.interface';
import { eachDay, isWeekend, toDateString } from '../calendar.util';

/**
 * 결정론적 기본 캘린더: 주말=휴장, 평일=개장.
 * 공휴일은 반영하지 않는다(실 공휴일 반영은 FinnhubCalendarProvider).
 */
@Injectable()
export class MockCalendarProvider implements CalendarProvider {
  readonly source = 'mock';

  getSessions(market: Market, from: Date, to: Date): Promise<MarketDay[]> {
    const sessions = eachDay(from, to).map((date) => ({
      market,
      sessionDate: toDateString(date),
      isOpen: !isWeekend(date),
    }));
    return Promise.resolve(sessions);
  }
}
