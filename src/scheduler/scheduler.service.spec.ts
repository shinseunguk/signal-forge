import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { SignalsService } from '../signals/signals.service';
import { StrategyRunnerService } from '../strategy/strategy-runner.service';
import { PerformanceService } from '../performance/performance.service';
import { CalendarSyncService } from '../calendar/calendar-sync.service';
import { SchedulerService } from './scheduler.service';
import { DailyReportService } from './daily-report.service';
import { Notifier } from '../notification/notifier.interface';

describe('SchedulerService', () => {
  let signals: { ingestAndTag: jest.Mock };
  let strategyRunner: { run: jest.Mock };
  let portfolio: { snapshot: jest.Mock };
  let performance: { evaluateSignals: jest.Mock };
  let dailyReport: { sendDailyDigest: jest.Mock };
  let calendarSync: { sync: jest.Mock };
  let db: { query: jest.Mock };
  let notifier: { notifyFailure: jest.Mock; send: jest.Mock; channel: string };
  let config: { get: jest.Mock };
  let service: SchedulerService;

  beforeEach(() => {
    signals = { ingestAndTag: jest.fn().mockResolvedValue({}) };
    strategyRunner = { run: jest.fn().mockResolvedValue([]) };
    portfolio = { snapshot: jest.fn().mockResolvedValue(undefined) };
    performance = { evaluateSignals: jest.fn().mockResolvedValue(undefined) };
    dailyReport = { sendDailyDigest: jest.fn().mockResolvedValue(undefined) };
    calendarSync = { sync: jest.fn().mockResolvedValue(undefined) };
    db = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: '1' }, { id: '2' }] }),
    };
    notifier = {
      notifyFailure: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
      channel: 'discord',
    };
    config = { get: jest.fn().mockReturnValue(true) };
    service = new SchedulerService(
      signals as unknown as SignalsService,
      strategyRunner as unknown as StrategyRunnerService,
      portfolio as unknown as PortfolioService,
      performance as unknown as PerformanceService,
      dailyReport as unknown as DailyReportService,
      calendarSync as unknown as CalendarSyncService,
      db as unknown as DatabaseService,
      notifier as unknown as Notifier,
      config as unknown as ConfigService,
    );
  });

  it('collectSignals 는 ingestAndTag 를 호출한다', async () => {
    await service.collectSignals();
    expect(signals.ingestAndTag).toHaveBeenCalledTimes(1);
  });

  it('runStrategy 는 모든 포트폴리오에 대해 run 을 호출한다', async () => {
    await service.runStrategy();
    expect(strategyRunner.run).toHaveBeenCalledTimes(2);
    expect(strategyRunner.run).toHaveBeenCalledWith(1);
    expect(strategyRunner.run).toHaveBeenCalledWith(2);
  });

  it('navSnapshot 은 모든 포트폴리오 스냅샷을 남긴다', async () => {
    await service.navSnapshot();
    expect(portfolio.snapshot).toHaveBeenCalledTimes(2);
  });

  it('잡 실패 시 알림을 보낸다', async () => {
    signals.ingestAndTag.mockRejectedValue(new Error('boom'));
    await service.collectSignals();
    expect(notifier.notifyFailure).toHaveBeenCalledWith(
      'collect-signals',
      expect.any(Error),
    );
  });

  it('dailyDigest 는 일일 다이제스트를 전송한다', async () => {
    await service.dailyDigest();
    expect(dailyReport.sendDailyDigest).toHaveBeenCalledTimes(1);
  });

  it('SCHEDULER_ENABLED=false 면 잡 본문을 건너뛴다', async () => {
    config.get.mockReturnValue(false);
    await service.collectSignals();
    expect(signals.ingestAndTag).not.toHaveBeenCalled();
  });

  it('syncCalendar 는 캘린더 동기화를 호출한다', async () => {
    await service.syncCalendar();
    expect(calendarSync.sync).toHaveBeenCalledTimes(1);
  });
});
