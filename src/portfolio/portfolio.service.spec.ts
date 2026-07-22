import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MarketService } from '../market/market.service';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  let db: { query: jest.Mock };
  let market: { getPrice: jest.Mock };
  let service: PortfolioService;

  beforeEach(() => {
    db = { query: jest.fn() };
    market = { getPrice: jest.fn() };
    service = new PortfolioService(
      db as unknown as DatabaseService,
      market as unknown as MarketService,
    );
  });

  const portfolioRow = {
    id: '1',
    name: 'signal-forge-main',
    base_currency: 'KRW',
    initial_cash: '100000000.0000',
    cash_balance: '99288000.0000',
  };

  it('getById 는 없는 포트폴리오에 NotFoundException 을 던진다', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.getById(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getPositions 는 NUMERIC 문자열을 number 로 매핑한다', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: '10',
          portfolio_id: '1',
          symbol: 'AAPL',
          market: 'US',
          quantity: '10.000000',
          avg_price: '70000.0000',
        },
      ],
      rowCount: 1,
    });
    const positions = await service.getPositions(1);
    expect(positions[0]).toEqual({
      id: 10,
      portfolioId: 1,
      symbol: 'AAPL',
      market: 'US',
      quantity: 10,
      avgPrice: 70000,
    });
  });

  it('valuate 는 cash + Σ(qty×현재가) 와 누적수익률을 계산한다', async () => {
    // getById → portfolio, getPositions → 1 position
    db.query
      .mockResolvedValueOnce({ rows: [portfolioRow], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '10',
            portfolio_id: '1',
            symbol: 'AAPL',
            market: 'US',
            quantity: '10.000000',
            avg_price: '70000.0000',
          },
        ],
        rowCount: 1,
      });
    market.getPrice.mockResolvedValue({
      symbol: 'AAPL',
      market: 'US',
      price: 71_200,
      capturedAt: new Date(),
    });

    const v = await service.valuate(1);
    expect(v.cashBalance).toBe(99_288_000);
    expect(v.positionsValue).toBe(712_000); // 10 × 71,200
    expect(v.totalValue).toBe(100_000_000); // 99,288,000 + 712,000
    expect(v.returnPct).toBeCloseTo(0, 6); // (1억 - 1억)/1억 × 100 = 0
  });

  it('quantity 0 인 포지션은 현재가를 조회하지 않는다', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [portfolioRow], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '11',
            portfolio_id: '1',
            symbol: 'MSFT',
            market: 'US',
            quantity: '0.000000',
            avg_price: '0.0000',
          },
        ],
        rowCount: 1,
      });

    const v = await service.valuate(1);
    expect(market.getPrice).not.toHaveBeenCalled();
    expect(v.positionsValue).toBe(0);
  });

  it('snapshot 은 portfolio_snapshot 에 밸류에이션을 기록한다', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [portfolioRow], rowCount: 1 }) // getById
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getPositions (없음)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insert snapshot

    await service.snapshot(1);

    const insertCall = db.query.mock.calls[2];
    expect(insertCall[0]).toContain('INSERT INTO portfolio_snapshot');
    // [portfolioId, total, cash, positions, returnPct]
    expect(insertCall[1][0]).toBe(1);
    expect(insertCall[1][1]).toBe(99_288_000); // total = cash (포지션 없음)
    expect(insertCall[1][3]).toBe(0); // positions_value
  });
});
