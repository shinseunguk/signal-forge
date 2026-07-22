import { DatabaseService } from '../database/database.service';
import { MarketService } from '../market/market.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { FxService } from '../fx/fx.service';
import { PerformanceService } from './performance.service';

describe('PerformanceService', () => {
  let db: { query: jest.Mock };
  let portfolio: { getById: jest.Mock; valuate: jest.Mock };
  let market: { getCandles: jest.Mock };
  let fx: { getRate: jest.Mock };
  let service: PerformanceService;

  beforeEach(() => {
    db = { query: jest.fn() };
    portfolio = { getById: jest.fn(), valuate: jest.fn() };
    market = { getCandles: jest.fn() };
    fx = { getRate: jest.fn().mockResolvedValue(1) };
    service = new PerformanceService(
      db as unknown as DatabaseService,
      portfolio as unknown as PortfolioService,
      market as unknown as MarketService,
      fx as unknown as FxService,
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

    it('USD 계좌(KRW 펀딩)는 환차익을 분해한다', async () => {
      // 1억 KRW @1350 → 74,074.07 USD 펀딩. 현재 75,000 USD, 현재환율 1400.
      portfolio.getById.mockResolvedValue({
        baseCurrency: 'USD',
        initialCash: 74_074.074,
        fundedCurrency: 'KRW',
        fundedAmount: 100_000_000,
        initialFxRate: 1350,
      });
      portfolio.valuate.mockResolvedValue({
        totalValue: 75_000,
        cashBalance: 0,
        positionsValue: 75_000,
        returnPct: 1.25,
      });
      fx.getRate.mockResolvedValue(1400);
      db.query
        .mockResolvedValueOnce({ rows: [] }) // snapshots
        .mockResolvedValueOnce({ rows: [] }); // orders

      const report = await service.portfolioReport(1);
      expect(report.fx).not.toBeNull();
      expect(report.fx!.currentValueInFunded).toBeCloseTo(105_000_000, 0); // 75000×1400
      expect(report.fx!.returnPctInFunded).toBeCloseTo(5, 2); // (1.05억-1억)/1억
      expect(report.fx!.fxPnl).toBeCloseTo(3_750_000, 0); // 75000×(1400-1350)
      // 주가손익 + 환차익 = 총 KRW 손익(5,000,000)
      expect(report.fx!.stockPnl + report.fx!.fxPnl).toBeCloseTo(5_000_000, 0);
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
