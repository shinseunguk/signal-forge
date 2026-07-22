import { ConfigService } from '@nestjs/config';
import { FinnhubCalendarProvider } from './finnhub-calendar.provider';

describe('FinnhubCalendarProvider', () => {
  function makeProvider(apiKey: string | undefined): FinnhubCalendarProvider {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'calendar.finnhubApiKey') return apiKey;
        if (key === 'calendar.finnhubBaseUrl') return 'https://finnhub.test/v1';
        return undefined;
      }),
    } as unknown as ConfigService;
    return new FinnhubCalendarProvider(config);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('완전 휴장(tradingHour 빈 문자열)일은 휴장, 단축장은 개장으로 처리한다', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { eventName: 'Independence Day', atDate: '2026-07-03', tradingHour: '' },
          { eventName: 'Thanksgiving', atDate: '2026-11-27', tradingHour: '09:30-13:00' },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = makeProvider('key-123');
    const sessions = await provider.getSessions(
      'US',
      new Date(2026, 6, 3), // 금 (완전 휴장)
      new Date(2026, 6, 3),
    );

    expect(sessions[0].isOpen).toBe(false); // 완전 휴장

    // 단축장(11-27 금)은 개장으로.
    const partial = await provider.getSessions(
      'US',
      new Date(2026, 10, 27),
      new Date(2026, 10, 27),
    );
    expect(partial[0].isOpen).toBe(true);
  });

  it('API 키가 없으면 에러를 던진다', async () => {
    const provider = makeProvider(undefined);
    await expect(
      provider.getSessions('US', new Date(2026, 0, 1), new Date(2026, 0, 2)),
    ).rejects.toThrow('FINNHUB_API_KEY');
  });
});
