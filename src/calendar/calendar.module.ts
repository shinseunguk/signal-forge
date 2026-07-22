import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CALENDAR_PROVIDER } from './calendar-provider.interface';
import { CalendarSyncService } from './calendar-sync.service';
import { MockCalendarProvider } from './providers/mock-calendar.provider';
import { FinnhubCalendarProvider } from './providers/finnhub-calendar.provider';

/**
 * 휴장일 캘린더 모듈. CALENDAR_PROVIDER 설정으로 구현체를 선택한다(default: mock).
 * finnhub 를 선택해도 FINNHUB_API_KEY 가 없으면 mock 으로 폴백한다.
 */
@Module({
  providers: [
    MockCalendarProvider,
    FinnhubCalendarProvider,
    {
      provide: CALENDAR_PROVIDER,
      inject: [ConfigService, MockCalendarProvider, FinnhubCalendarProvider],
      useFactory: (
        config: ConfigService,
        mock: MockCalendarProvider,
        finnhub: FinnhubCalendarProvider,
      ) => {
        const provider = config.get<string>('calendar.provider') ?? 'mock';
        const apiKey = config.get<string>('calendar.finnhubApiKey');
        return provider === 'finnhub' && apiKey ? finnhub : mock;
      },
    },
    CalendarSyncService,
  ],
  exports: [CalendarSyncService],
})
export class CalendarModule {}
