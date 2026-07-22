import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { MarketService } from '../market/market.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { RiskGateService } from './risk-gate.service';

describe('RiskGateService', () => {
  let db: { query: jest.Mock };
  let portfolio: { getById: jest.Mock; valuate: jest.Mock; getPositions: jest.Mock };
  let market: { getPrice: jest.Mock };
  let config: { get: jest.Mock };
  let service: RiskGateService;

  const weekday = new Date('2026-07-22T02:00:00Z'); // 수요일

  beforeEach(() => {
    db = { query: jest.fn() };
    portfolio = {
      getById: jest.fn().mockResolvedValue({
        id: 1,
        name: 'p',
        baseCurrency: 'KRW',
        initialCash: 100_000_000,
        cashBalance: 100_000_000,
      }),
      valuate: jest.fn().mockResolvedValue({
        totalValue: 100_000_000,
        cashBalance: 100_000_000,
        positionsValue: 0,
        returnPct: 0,
      }),
      getPositions: jest.fn().mockResolvedValue([]),
    };
    market = { getPrice: jest.fn() };
    config = {
      get: jest.fn((key: string) =>
        key === 'risk.dailyLossLimitPct' ? 3 : 20,
      ),
    };
    service = new RiskGateService(
      db as unknown as DatabaseService,
      portfolio as unknown as PortfolioService,
      market as unknown as MarketService,
      config as unknown as ConfigService,
    );
  });

  function calendarReturns(isOpen: boolean | null) {
    // isMarketOpen 의 market_calendar 조회
    db.query.mockImplementation((sql: string) => {
      if (sql.includes('market_calendar')) {
        return Promise.resolve(
          isOpen === null
            ? { rows: [], rowCount: 0 }
            : { rows: [{ is_open: isOpen }], rowCount: 1 },
        );
      }
      // portfolio_snapshot baseline 조회 → 없음
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  }

  it('휴장일(캘린더 is_open=false)이면 거부한다', async () => {
    calendarReturns(false);
    const d = await service.checkBuy({
      portfolioId: 1,
      symbol: '005930',
      market: 'KRX',
      orderAmount: 1_000_000,
      at: weekday,
    });
    expect(d.allowed).toBe(false);
    expect(d.gate).toBe('market_closed');
  });

  it('캘린더 레코드가 없으면 평일은 개장으로 통과한다', async () => {
    calendarReturns(null);
    const d = await service.checkBuy({
      portfolioId: 1,
      symbol: '005930',
      market: 'KRX',
      orderAmount: 1_000_000,
      at: weekday,
    });
    expect(d.allowed).toBe(true);
  });

  it('주말은 캘린더가 없어도 휴장으로 거부한다', async () => {
    calendarReturns(null);
    const sunday = new Date('2026-07-19T02:00:00Z');
    const d = await service.checkBuy({
      portfolioId: 1,
      symbol: '005930',
      market: 'KRX',
      orderAmount: 1_000_000,
      at: sunday,
    });
    expect(d.allowed).toBe(false);
    expect(d.gate).toBe('market_closed');
  });

  it('당일 손실이 한도(시드 3%)에 도달하면 거부한다', async () => {
    calendarReturns(null);
    // baseline = initialCash(1억), current = 9,600만 → 손실 400만 >= 300만
    portfolio.valuate.mockResolvedValue({
      totalValue: 96_000_000,
      cashBalance: 96_000_000,
      positionsValue: 0,
      returnPct: -4,
    });
    const d = await service.checkBuy({
      portfolioId: 1,
      symbol: '005930',
      market: 'KRX',
      orderAmount: 1_000_000,
      at: weekday,
    });
    expect(d.allowed).toBe(false);
    expect(d.gate).toBe('daily_loss_limit');
  });

  it('매수 후 비중이 상한(20%)을 초과하면 거부한다', async () => {
    calendarReturns(null);
    // total 1억, 신규 매수 2,500만 → 25% > 20%
    const d = await service.checkBuy({
      portfolioId: 1,
      symbol: '005930',
      market: 'KRX',
      orderAmount: 25_000_000,
      at: weekday,
    });
    expect(d.allowed).toBe(false);
    expect(d.gate).toBe('position_weight');
  });

  it('모든 게이트 통과 시 allowed=true', async () => {
    calendarReturns(null);
    const d = await service.checkBuy({
      portfolioId: 1,
      symbol: '005930',
      market: 'KRX',
      orderAmount: 5_000_000, // 5%
      at: weekday,
    });
    expect(d.allowed).toBe(true);
  });
});
