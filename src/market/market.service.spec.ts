import { DatabaseService } from '../database/database.service';
import { MarketService } from './market.service';
import { QuoteProvider } from './quote-provider.interface';
import { Quote } from './market.types';

describe('MarketService', () => {
  let db: { query: jest.Mock };
  let provider: QuoteProvider;
  let service: MarketService;

  const sampleQuote: Quote = {
    symbol: 'AAPL',
    market: 'US',
    price: 71_200,
    capturedAt: new Date('2026-07-21T06:00:00Z'),
  };

  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) };
    provider = {
      source: 'mock',
      getPrice: jest.fn().mockResolvedValue(sampleQuote),
      getCandles: jest.fn().mockResolvedValue([]),
    };
    service = new MarketService(
      provider,
      db as unknown as DatabaseService,
    );
  });

  it('getPrice 는 provider 결과를 반환한다', async () => {
    const quote = await service.getPrice('AAPL', 'US');
    expect(quote).toEqual(sampleQuote);
    expect(provider.getPrice).toHaveBeenCalledWith('AAPL', 'US');
  });

  it('getPrice 는 price_snapshot 에 1행을 기록한다', async () => {
    await service.getPrice('AAPL', 'US');
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO price_snapshot');
    expect(params).toEqual([
      'AAPL',
      'US',
      71_200,
      'mock',
      sampleQuote.capturedAt,
    ]);
  });

  it('getCandles 는 provider 에 위임하고 스냅샷을 남기지 않는다', async () => {
    const from = new Date('2026-07-01T00:00:00Z');
    const to = new Date('2026-07-05T00:00:00Z');
    await service.getCandles('AAPL', 'US', from, to);
    expect(provider.getCandles).toHaveBeenCalledWith('AAPL', 'US', from, to);
    expect(db.query).not.toHaveBeenCalled();
  });
});
