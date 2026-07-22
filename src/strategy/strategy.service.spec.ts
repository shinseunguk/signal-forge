import { DatabaseService } from '../database/database.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { StrategyService } from './strategy.service';
import { STRATEGY_V1 } from './strategy.config';

describe('StrategyService.evaluate', () => {
  let db: { query: jest.Mock };
  let portfolio: { getPositions: jest.Mock };
  let service: StrategyService;

  beforeEach(() => {
    db = { query: jest.fn() };
    portfolio = { getPositions: jest.fn() };
    service = new StrategyService(
      db as unknown as DatabaseService,
      portfolio as unknown as PortfolioService,
    );
  });

  function badNews(rows: Array<{ symbol: string; market: string; id: string }>) {
    db.query.mockResolvedValue({ rows, rowCount: rows.length });
  }

  it('악재 없고 포지션 없으면 watchlist 전체 BUY', async () => {
    badNews([]);
    portfolio.getPositions.mockResolvedValue([]);
    const actions = await service.evaluate(1);
    const buys = actions.filter((a) => a.action === 'BUY');
    expect(buys).toHaveLength(STRATEGY_V1.watchlist.length);
    expect(buys[0].orderAmount).toBe(STRATEGY_V1.buyOrderAmount);
  });

  it('악재 종목은 BUY 대신 HOLD(신규 매수 금지)', async () => {
    badNews([{ symbol: 'AAPL', market: 'US', id: '99' }]);
    portfolio.getPositions.mockResolvedValue([]);
    const actions = await service.evaluate(1);
    const s = actions.find((a) => a.symbol === 'AAPL');
    expect(s?.action).toBe('HOLD');
    expect(s?.signalId).toBe(99);
    // 다른 관심 종목은 여전히 BUY
    expect(actions.find((a) => a.symbol === 'MSFT')?.action).toBe('BUY');
  });

  it('악재 종목을 보유 중이면 SELL 후보', async () => {
    badNews([{ symbol: 'AAPL', market: 'US', id: '77' }]);
    portfolio.getPositions.mockResolvedValue([
      {
        id: 1,
        portfolioId: 1,
        symbol: 'AAPL',
        market: 'US',
        quantity: 10,
        avgPrice: 250,
      },
    ]);
    const actions = await service.evaluate(1);
    const sell = actions.find((a) => a.action === 'SELL');
    expect(sell?.symbol).toBe('AAPL');
    expect(sell?.quantity).toBe(10);
    expect(sell?.signalId).toBe(77);
  });
});
