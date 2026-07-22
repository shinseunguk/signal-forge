import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MarketService } from '../market/market.service';
import { PaperExecutionService } from './paper-execution.service';
import { FEES, SELL_TAX, SLIPPAGE } from './execution.constants';

/**
 * withTransaction 은 콜백에 fakeClient 를 넘겨 실행하도록 모킹한다.
 * client.query 는 호출 순서대로 미리 준비한 응답을 반환한다.
 */
function makeFakeClient(responses: Array<{ rows: unknown[]; rowCount?: number }>) {
  const query = jest.fn();
  for (const r of responses) {
    query.mockResolvedValueOnce({ rowCount: r.rowCount ?? r.rows.length, ...r });
  }
  return { query };
}

describe('PaperExecutionService', () => {
  let db: { query: jest.Mock; withTransaction: jest.Mock };
  let market: { getPrice: jest.Mock };
  let service: PaperExecutionService;

  beforeEach(() => {
    db = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      withTransaction: jest.fn(),
    };
    market = { getPrice: jest.fn() };
    service = new PaperExecutionService(
      db as unknown as DatabaseService,
      market as unknown as MarketService,
    );
  });

  function mockQuote(price: number) {
    market.getPrice.mockResolvedValue({
      symbol: 'AAPL',
      market: 'US',
      price,
      capturedAt: new Date(),
    });
  }

  it('paperBuy: 슬리피지·수수료를 반영하고 net_cash_flow=-(gross+fee)', async () => {
    mockQuote(70_000);
    // 트랜잭션 내부: [lock cash, update cash, select position(없음), insert position, insert order]
    const client = makeFakeClient([
      { rows: [{ cash_balance: '100000000.0000' }] }, // lock cash
      { rows: [] }, // update portfolio
      { rows: [] }, // select position (없음)
      { rows: [] }, // insert position
      { rows: [makeOrderRow({ side: 'BUY', quantity: '10' })] }, // insert order
    ]);
    db.withTransaction.mockImplementation((cb) => cb(client));

    const order = await service.paperBuy({
      portfolioId: 1,
      symbol: 'AAPL',
      market: 'US',
      quantity: 10,
      idempotencyKey: 'buy-1',
      decidedAt: new Date(),
    });

    const fill = 70_000 * (1 + SLIPPAGE); // 70,070
    const gross = 10 * fill; // 700,700
    const fee = gross * FEES.US.commission; // 105.105
    // update portfolio 호출의 net_cash_flow 인자 검증
    const updateCall = client.query.mock.calls[1];
    expect(updateCall[0]).toContain('UPDATE portfolio');
    expect(updateCall[1][0]).toBeCloseTo(-(gross + fee), 4);
    expect(order.side).toBe('BUY');
  });

  it('paperBuy: 예수금 부족 시 거부', async () => {
    mockQuote(70_000);
    const client = makeFakeClient([
      { rows: [{ cash_balance: '1000.0000' }] }, // 부족
    ]);
    db.withTransaction.mockImplementation((cb) => cb(client));

    await expect(
      service.paperBuy({
        portfolioId: 1,
        symbol: 'AAPL',
        market: 'US',
        quantity: 10,
        idempotencyKey: 'buy-2',
        decidedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('paperBuy: quantity 와 orderAmount 동시 지정 시 거부', async () => {
    await expect(
      service.paperBuy({
        portfolioId: 1,
        symbol: 'AAPL',
        market: 'US',
        quantity: 10,
        orderAmount: 1_000_000,
        idempotencyKey: 'buy-3',
        decidedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('paperBuy: orderAmount 기반 수량은 수수료 포함 예산 내로 산정(US 소수점)', async () => {
    mockQuote(70_000);
    const client = makeFakeClient([
      { rows: [{ cash_balance: '100000000.0000' }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [makeOrderRow({ side: 'BUY' })] },
    ]);
    db.withTransaction.mockImplementation((cb) => cb(client));

    await service.paperBuy({
      portfolioId: 1,
      symbol: 'AAPL',
      market: 'US',
      orderAmount: 1_000_000,
      idempotencyKey: 'buy-4',
      decidedAt: new Date(),
    });

    const fill = 70_000 * (1 + SLIPPAGE);
    const unitCost = fill * (1 + FEES.US.commission);
    // 미국 주식은 소수점 체결 → round6.
    const expectedQty = Math.round((1_000_000 / unitCost) * 1e6) / 1e6;
    const insertPos = client.query.mock.calls[3];
    expect(insertPos[0]).toContain('INSERT INTO position');
    expect(insertPos[1][3]).toBe(expectedQty);
  });

  it('paperSell: 수수료+세금 반영, net_cash_flow=+(gross-fee-tax)', async () => {
    mockQuote(80_000);
    const client = makeFakeClient([
      { rows: [{ quantity: '10.000000' }] }, // lock position
      { rows: [] }, // update portfolio
      { rows: [] }, // update position
      { rows: [makeOrderRow({ side: 'SELL', quantity: '5' })] }, // insert order
    ]);
    db.withTransaction.mockImplementation((cb) => cb(client));

    await service.paperSell({
      portfolioId: 1,
      symbol: 'AAPL',
      market: 'US',
      quantity: 5,
      idempotencyKey: 'sell-1',
      decidedAt: new Date(),
    });

    const fill = 80_000 * (1 - SLIPPAGE); // 79,920
    const gross = 5 * fill;
    const fee = gross * FEES.US.commission;
    const tax = gross * SELL_TAX.US;
    const updateCash = client.query.mock.calls[1];
    expect(updateCash[0]).toContain('UPDATE portfolio');
    expect(updateCash[1][0]).toBeCloseTo(gross - fee - tax, 4);
  });

  it('paperSell: 보유 수량 초과 시 거부', async () => {
    mockQuote(80_000);
    const client = makeFakeClient([{ rows: [{ quantity: '3.000000' }] }]);
    db.withTransaction.mockImplementation((cb) => cb(client));

    await expect(
      service.paperSell({
        portfolioId: 1,
        symbol: 'AAPL',
        market: 'US',
        quantity: 5,
        idempotencyKey: 'sell-2',
        decidedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('멱등성: 같은 idempotencyKey 재호출 시 기존 주문 반환하고 트랜잭션 미실행', async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeOrderRow({ side: 'BUY', idempotency_key: 'dup' })],
      rowCount: 1,
    });

    const order = await service.paperBuy({
      portfolioId: 1,
      symbol: 'AAPL',
      market: 'US',
      quantity: 10,
      idempotencyKey: 'dup',
      decidedAt: new Date(),
    });

    expect(order.idempotencyKey).toBe('dup');
    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(market.getPrice).not.toHaveBeenCalled();
  });
});

function makeOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    portfolio_id: '1',
    symbol: 'AAPL',
    market: 'US',
    side: 'BUY',
    order_type: 'MARKET',
    quantity: '10.000000',
    fill_price: '70070.0000',
    gross_amount: '700700.0000',
    fee: '105.1050',
    tax: '0.0000',
    net_cash_flow: '-700805.1050',
    signal_id: null,
    idempotency_key: 'buy-1',
    note: null,
    decided_at: new Date(),
    created_at: new Date(),
    ...overrides,
  };
}
