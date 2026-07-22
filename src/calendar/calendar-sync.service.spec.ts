import { DatabaseService } from '../database/database.service';
import { CalendarProvider } from './calendar-provider.interface';
import { CalendarSyncService } from './calendar-sync.service';

describe('CalendarSyncService', () => {
  it('provider 세션을 market_calendar 에 upsert 한다', async () => {
    const provider: CalendarProvider = {
      source: 'mock',
      getSessions: jest.fn().mockResolvedValue([
        { market: 'US', sessionDate: '2026-01-01', isOpen: false },
        { market: 'US', sessionDate: '2026-01-02', isOpen: true },
      ]),
    };
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1 }),
    } as unknown as DatabaseService;

    const service = new CalendarSyncService(provider, db);
    const result = await service.sync(new Date(2026, 5, 15));

    // 2개 시장(US, KRX) × 2세션 = 4회 upsert.
    expect(provider.getSessions).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenCalledTimes(4);
    expect(result.upserted).toBe(4);

    // upsert 쿼리에 ON CONFLICT 갱신이 포함돼야 한다.
    const [sql, params] = (db.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(params).toEqual(['US', '2026-01-01', false]);
  });
});
