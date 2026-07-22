import { PaperExecutionService } from '../execution/paper-execution.service';
import { RiskGateService } from '../risk/risk-gate.service';
import { StrategyService } from './strategy.service';
import { StrategyRunnerService } from './strategy-runner.service';
import { StrategyAction } from './strategy.types';

describe('StrategyRunnerService.run', () => {
  let strategy: { evaluate: jest.Mock };
  let risk: { checkBuy: jest.Mock; isTradeable: jest.Mock };
  let execution: { paperBuy: jest.Mock; paperSell: jest.Mock };
  let runner: StrategyRunnerService;

  const at = new Date('2026-07-22T02:00:00Z');

  beforeEach(() => {
    strategy = { evaluate: jest.fn() };
    risk = {
      checkBuy: jest.fn(),
      isTradeable: jest.fn().mockResolvedValue({ allowed: true }),
    };
    execution = {
      paperBuy: jest.fn().mockResolvedValue({ id: 100 }),
      paperSell: jest.fn().mockResolvedValue({ id: 200 }),
    };
    runner = new StrategyRunnerService(
      strategy as unknown as StrategyService,
      risk as unknown as RiskGateService,
      execution as unknown as PaperExecutionService,
    );
  });

  it('BUY 액션이 게이트 통과 시 paperBuy 를 멱등 키로 실행', async () => {
    const actions: StrategyAction[] = [
      { action: 'BUY', symbol: 'AAPL', market: 'US', orderAmount: 1_000_000, reason: '적립' },
    ];
    strategy.evaluate.mockResolvedValue(actions);
    risk.checkBuy.mockResolvedValue({ allowed: true });

    const outcomes = await runner.run(1, at);
    expect(outcomes[0].status).toBe('executed');
    expect(outcomes[0].orderId).toBe(100);
    expect(execution.paperBuy).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'buy-AAPL-20260722' }),
    );
  });

  it('BUY 액션이 게이트 거부 시 실행하지 않는다', async () => {
    strategy.evaluate.mockResolvedValue([
      { action: 'BUY', symbol: 'AAPL', market: 'US', orderAmount: 1_000_000, reason: '적립' },
    ]);
    risk.checkBuy.mockResolvedValue({
      allowed: false,
      gate: 'position_weight',
      reason: '비중 초과',
    });

    const outcomes = await runner.run(1, at);
    expect(outcomes[0].status).toBe('skipped');
    expect(execution.paperBuy).not.toHaveBeenCalled();
  });

  it('SELL 액션은 개장일에 paperSell 실행', async () => {
    strategy.evaluate.mockResolvedValue([
      { action: 'SELL', symbol: 'AAPL', market: 'US', quantity: 10, reason: '악재 청산', signalId: 5 },
    ]);
    const outcomes = await runner.run(1, at);
    expect(outcomes[0].status).toBe('executed');
    expect(execution.paperSell).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 10, idempotencyKey: 'sell-AAPL-20260722' }),
    );
  });

  it('SELL 액션은 휴장·비허용 세션에 보류', async () => {
    risk.isTradeable.mockResolvedValue({
      allowed: false,
      gate: 'market_session',
      reason: 'US AFTER 세션',
    });
    strategy.evaluate.mockResolvedValue([
      { action: 'SELL', symbol: 'AAPL', market: 'US', quantity: 10, reason: '악재 청산' },
    ]);
    const outcomes = await runner.run(1, at);
    expect(outcomes[0].status).toBe('skipped');
    expect(execution.paperSell).not.toHaveBeenCalled();
  });

  it('HOLD 액션은 건너뛴다', async () => {
    strategy.evaluate.mockResolvedValue([
      { action: 'HOLD', symbol: 'AAPL', market: 'US', reason: '악재 필터' },
    ]);
    const outcomes = await runner.run(1, at);
    expect(outcomes[0].status).toBe('skipped');
    expect(execution.paperBuy).not.toHaveBeenCalled();
    expect(execution.paperSell).not.toHaveBeenCalled();
  });
});
