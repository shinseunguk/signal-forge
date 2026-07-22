import { DatabaseService } from '../database/database.service';
import { MarketService } from '../market/market.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PerformanceService } from './performance.service';

describe('PerformanceService', () => {
  let db: { query: jest.Mock };
  let portfolio: { getById: jest.Mock; valuate: jest.Mock };
  let market: { getCandles: jest.Mock };
  let service: PerformanceService;

  beforeEach(() => {
    db = { query: jest.fn() };
    portfolio = { getById: jest.fn(), valuate: jest.fn() };
    market = { getCandles: jest.fn() };
    service = new PerformanceService(
      db as unknown as DatabaseService,
      portfolio as unknown as PortfolioService,
      market as unknown as MarketService,
    );
  });

  describe('portfolioReport', () => {
    it('MDD·마찰비용·주문수·일간승률을 집계한다', async () => {
      portfolio.getById.mockResolvedValue({ initialCash: 100_000_000 });
      portfolio.valuate.mockResolvedValue({
        totalValue: 101_000_000,
        cashBalance: 0,
        positionsValue: 0,
        returnPct: 1,
      });
      db.query
        // snapshots: 100 → 110 → 99 → 105 (peak 110, trough 99 → MDD 10%)
        .mockResolvedValueOnce({
          rows: [
            { total_value: '100' },
            { total_value: '110' },
            { total_value: '99' },
            { total_value: '105' },
          ],
        })
        // orders: 2건, fee/tax
        .mockResolvedValueOnce({
          rows: [
            { side: 'BUY', fee: '100', tax: '0' },
            { side: 'SELL', fee: '50', tax: '30' },
          ],
        });

      const report = await service.portfolioReport(1);
      expect(report.maxDrawdownPct).toBeCloseTo(10, 4); // (110-99)/110
      expect(report.totalFriction).toBe(180);
      expect(report.orderCount).toBe(2);
      expect(report.buyCount).toBe(1);
      expect(report.sellCount).toBe(1);
      // 상승 구간: 100→110(+), 110→99(-), 99→105(+) → 2/3
      expect(report.dailyWinRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('evaluateSignals', () => {
    it('horizon 후 수익률을 계산해 signal_outcome 에 upsert 한다', async () => {
      // 평가 대상 시그널 1건
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            symbol: '005930',
            market: 'KRX',
            published_at: new Date('2026-06-01T00:00:00Z'),
          },
        ],
      });
      // price_at_signal 캔들, price_after 캔들
      market.getCandles
        .mockResolvedValueOnce([
          { timestamp: new Date('2026-06-01T00:00:00Z'), close: 100 },
        ])
        .mockResolvedValueOnce([
          { timestamp: new Date('2026-06-06T00:00:00Z'), close: 110 },
        ]);
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insert outcome

      await service.evaluateSignals([5], new Date('2026-07-01T00:00:00Z'));

      const insertCall = db.query.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO signal_outcome');
      // [signalId, horizon, priceAt, priceAfter, returnPct]
      expect(insertCall[1][2]).toBe(100);
      expect(insertCall[1][3]).toBe(110);
      expect(insertCall[1][4]).toBeCloseTo(10, 4); // (110/100-1)*100
    });

    it('price_at_signal 을 못 구하면 스킵한다', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            symbol: 'X',
            market: 'KRX',
            published_at: new Date('2026-06-01T00:00:00Z'),
          },
        ],
      });
      market.getCandles.mockResolvedValue([]); // 캔들 없음
      await service.evaluateSignals([5], new Date('2026-07-01T00:00:00Z'));
      // insert 는 호출되지 않음 (select 1회만)
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('signalEfficacyReport', () => {
    it('카테고리·감성 구간별 집계를 반환한다', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [
            { key: 'EARNINGS', horizon_days: 5, n: '3', avg_ret: '2.5', win: '66.6667' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { key: 'bullish', horizon_days: 5, n: '2', avg_ret: '1.2', win: '50' },
          ],
        });

      const report = await service.signalEfficacyReport();
      expect(report.byCategory[0]).toEqual({
        key: 'EARNINGS',
        horizonDays: 5,
        count: 3,
        avgReturnPct: 2.5,
        winRatePct: 66.67,
      });
      expect(report.bySentiment[0].key).toBe('bullish');
    });
  });
});
