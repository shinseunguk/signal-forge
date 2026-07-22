import { DatabaseService } from '../database/database.service';
import { PerformanceService } from '../performance/performance.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { Notifier } from '../notification/notifier.interface';
import { DailyReportService } from './daily-report.service';

describe('DailyReportService', () => {
  let performance: {
    portfolioReport: jest.Mock;
    tradingJournal: jest.Mock;
    signalEfficacyReport: jest.Mock;
  };
  let portfolio: object;
  let db: { query: jest.Mock };
  let notifier: { send: jest.Mock; notifyFailure: jest.Mock; channel: string };
  let service: DailyReportService;

  const at = new Date('2026-07-22T06:00:00Z');

  beforeEach(() => {
    performance = {
      portfolioReport: jest.fn().mockResolvedValue({
        portfolioId: 1,
        initialCash: 100_000_000,
        currentValue: 100_712_000,
        returnPct: 0.712,
        maxDrawdownPct: 0.5,
        totalFriction: 330,
        orderCount: 2,
        buyCount: 1,
        sellCount: 1,
        dailyWinRate: 50,
        snapshotCount: 3,
      }),
      tradingJournal: jest.fn().mockResolvedValue([
        {
          side: 'BUY',
          symbol: '005930',
          market: 'KRX',
          quantity: 6,
          fillPrice: 150_291,
          fee: 225,
          tax: 0,
          netCashFlow: -901_971,
          decidedAt: at,
          note: '적립',
        },
      ]),
      signalEfficacyReport: jest.fn().mockResolvedValue({
        byCategory: [
          { key: 'EARNINGS', horizonDays: 5, count: 2, avgReturnPct: 1.5, winRatePct: 100 },
        ],
        bySentiment: [],
      }),
    };
    portfolio = {};
    db = { query: jest.fn() };
    notifier = {
      send: jest.fn().mockResolvedValue(undefined),
      notifyFailure: jest.fn(),
      channel: 'discord',
    };
    service = new DailyReportService(
      performance as unknown as PerformanceService,
      portfolio as unknown as PortfolioService,
      db as unknown as DatabaseService,
      notifier as unknown as Notifier,
    );
  });

  it('다이제스트에 수익금액·수익률·매매·예측력을 담는다', async () => {
    const text = await service.buildDigest(1, 'signal-forge-main', at);
    expect(text).toContain('총평가액');
    expect(text).toContain('+712,000원'); // 수익금액
    expect(text).toContain('+0.712%'); // 수익률
    expect(text).toContain('매수 005930 6주'); // 매매일지
    expect(text).toContain('EARNINGS'); // 예측력
  });

  it('sendDailyDigest 는 모든 포트폴리오에 대해 알림을 전송한다', async () => {
    db.query.mockResolvedValue({
      rows: [
        { id: '1', name: 'p1' },
        { id: '2', name: 'p2' },
      ],
    });
    await service.sendDailyDigest(at);
    expect(notifier.send).toHaveBeenCalledTimes(2);
  });

  it('매매가 없으면 "없음"으로 표기한다', async () => {
    performance.tradingJournal.mockResolvedValue([]);
    const text = await service.buildDigest(1, 'p', at);
    expect(text).toContain('오늘 매매: 없음');
  });
});
