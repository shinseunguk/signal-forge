import { MockQuoteProvider } from './mock-quote.provider';

describe('MockQuoteProvider', () => {
  let provider: MockQuoteProvider;

  beforeEach(() => {
    provider = new MockQuoteProvider();
  });

  it('source 는 mock 이다', () => {
    expect(provider.source).toBe('mock');
  });

  it('getPrice 는 양수 가격을 가진 Quote 를 반환한다', async () => {
    const quote = await provider.getPrice('005930', 'KRX');
    expect(quote.symbol).toBe('005930');
    expect(quote.market).toBe('KRX');
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.capturedAt).toBeInstanceOf(Date);
  });

  it('KRX 가격은 원 단위(수천~수십만) 스케일이다', async () => {
    const quote = await provider.getPrice('005930', 'KRX');
    expect(quote.price).toBeGreaterThanOrEqual(10_000);
  });

  it('US 가격은 달러 단위(수십~수백) 스케일이다', async () => {
    const quote = await provider.getPrice('AAPL', 'US');
    expect(quote.price).toBeLessThan(1_000);
  });

  it('같은 심볼·같은 날짜의 캔들 종가는 결정론적이다(재현성)', async () => {
    const from = new Date('2026-07-01T00:00:00Z');
    const to = new Date('2026-07-05T00:00:00Z');
    const a = await provider.getCandles('005930', 'KRX', from, to);
    const b = await provider.getCandles('005930', 'KRX', from, to);
    expect(a.map((c) => c.close)).toEqual(b.map((c) => c.close));
  });

  it('캔들의 high/low 는 open/close 를 감싼다', async () => {
    const from = new Date('2026-07-01T00:00:00Z');
    const to = new Date('2026-07-03T00:00:00Z');
    const candles = await provider.getCandles('AAPL', 'US', from, to);
    expect(candles.length).toBeGreaterThan(0);
    for (const c of candles) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
    }
  });
});
