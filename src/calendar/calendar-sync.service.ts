import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Market } from '../market/market.types';
import { CALENDAR_PROVIDER } from './calendar-provider.interface';
import type { CalendarProvider } from './calendar-provider.interface';

/** 캘린더를 채울 대상 거래소. */
const MARKETS: Market[] = ['US'];

export interface SyncResult {
  upserted: number;
  from: string;
  to: string;
}

/**
 * CalendarProvider 결과를 market_calendar 에 upsert 한다.
 * 부팅 시 1회 채우고(비어 있을 때 대비), 이후 스케줄러가 주기적으로 갱신한다.
 */
@Injectable()
export class CalendarSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    @Inject(CALENDAR_PROVIDER) private readonly provider: CalendarProvider,
    private readonly db: DatabaseService,
  ) {}

  /** 부팅 직후 1회 동기화 (실패해도 앱 기동은 막지 않는다 — fallback 규칙이 있으므로). */
  onApplicationBootstrap(): void {
    void this.sync().catch((error) => {
      this.logger.error(`부팅 시 캘린더 동기화 실패: ${error}`);
    });
  }

  /** 올해 초 ~ 내년 말 구간의 세션을 provider 에서 받아 upsert 한다. */
  async sync(at: Date = new Date()): Promise<SyncResult> {
    const from = new Date(at.getFullYear(), 0, 1);
    const to = new Date(at.getFullYear() + 1, 11, 31);

    let upserted = 0;
    for (const market of MARKETS) {
      const sessions = await this.provider.getSessions(market, from, to);
      for (const session of sessions) {
        const { rowCount } = await this.db.query(
          `INSERT INTO market_calendar (market, session_date, is_open)
           VALUES ($1, $2, $3)
           ON CONFLICT (market, session_date)
           DO UPDATE SET is_open = EXCLUDED.is_open`,
          [session.market, session.sessionDate, session.isOpen],
        );
        upserted += rowCount ?? 0;
      }
    }

    const result: SyncResult = {
      upserted,
      from: this.toDateString(from),
      to: this.toDateString(to),
    };
    this.logger.log(
      `calendar sync [${this.provider.source}]: ${result.from}~${result.to}, upserted ${upserted}`,
    );
    return result;
  }

  private toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
