import { DatabaseService } from '../database/database.service';
import { MarketService } from './market.service';
import { QuoteProvider } from './quote-provider.interface';
import { Quote } from './market.types';

describe('MarketService', () => {
  let db: { query: jest.Mock };
  let provider: QuoteProvider;
  let service: MarketService;

  const sampleQuote: Quote = {
    symbol: '005930',
    market: 'KRX',
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
    const quote = await service.getPrice('005930', 'KRX');
    expect(quote).toEqual(sampleQuote);
    expect(provider.getPrice).toHaveBeenCalledWith('005930', 'KRX');
  });

  it('getPrice 는 price_snapshot 에 1행을 기록한다', async () => {
    await service.getPrice('005930', 'KRX');
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO price_snapshot');
    expect(params).toEqual([
      '005930',
      'KRX',
      71_200,
      'mock',
      sampleQuote.capturedAt,
    ]);
  });

  it('getCandles 는 provider 에 위임하고 스냅샷을 남기지 않는다', async () => {
    const from = new Date('2026-07-01T00:00:00Z');
    const to = new Date('2026-07-05T00:00:00Z');
    await service.getCandles('005930', 'KRX', from, to);
    expect(provider.getCandles).toHaveBeenCalledWith('005930', 'KRX', from, to);
    expect(db.query).not.toHaveBeenCalled();
  });
});
