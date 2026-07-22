import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { SignalsService } from '../signals/signals.service';
import { StrategyRunnerService } from '../strategy/strategy-runner.service';
import { PerformanceService } from '../performance/performance.service';
import { NOTIFIER } from '../notification/notifier.interface';
import type { Notifier } from '../notification/notifier.interface';
import { DailyReportService } from './daily-report.service';

// 미국 주식 계좌 기준. cron 은 거래소 타임존(ET)으로 정렬 → 서머타임 자동 반영.
// 실제 매매 세션(본장) 제한은 RiskGate 세션 게이트가 강제한다.
const TZ = 'America/New_York';

/**
 * 스케줄 잡 (기획서 §7). 모든 잡은 실패 시 Slack 으로 알린다.
 * SCHEDULER_ENABLED=false 면 잡 본문을 건너뛴다(테스트/특정 환경용).
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly signals: SignalsService,
    private readonly strategyRunner: StrategyRunnerService,
    private readonly portfolio: PortfolioService,
    private readonly performance: PerformanceService,
    private readonly dailyReport: DailyReportService,
    private readonly db: DatabaseService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    private readonly config: ConfigService,
  ) {}

  /** 뉴스/공시 수집 + LLM 태깅 (ET 프리~애프터, 평일 5분). */
  @Cron('*/5 4-20 * * 1-5', { name: 'collect-signals', timeZone: TZ })
  collectSignals(): Promise<void> {
    return this.wrap('collect-signals', async () => {
      await this.signals.ingestAndTag();
    });
  }

  /** 전략 평가 → 페이퍼 주문 (ET 본장 시간대, 평일 10분). 세션 게이트가 본장만 허용. */
  @Cron('*/10 9-15 * * 1-5', { name: 'run-strategy', timeZone: TZ })
  runStrategy(): Promise<void> {
    return this.wrap('run-strategy', async () => {
      const ids = await this.getPortfolioIds();
      for (const id of ids) {
        await this.strategyRunner.run(id);
      }
    });
  }

  /** 일일 NAV 스냅샷 (ET 본장 마감 후). */
  @Cron('5 16 * * 1-5', { name: 'nav-snapshot', timeZone: TZ })
  navSnapshot(): Promise<void> {
    return this.wrap('nav-snapshot', async () => {
      const ids = await this.getPortfolioIds();
      for (const id of ids) {
        await this.portfolio.snapshot(id);
      }
    });
  }

  /** 시그널 성과 평가 (매일 새벽). horizon 1/5/20일 후 실제 수익률 계산. */
  @Cron('0 6 * * *', { name: 'evaluate-signals', timeZone: TZ })
  evaluateSignals(): Promise<void> {
    return this.wrap('evaluate-signals', async () => {
      await this.performance.evaluateSignals([1, 5, 20]);
    });
  }

  /** 일일 다이제스트 알림 (ET 본장 마감 후). 수익률·수익금액·매매일지·예측력. */
  @Cron('30 16 * * 1-5', { name: 'daily-digest', timeZone: TZ })
  dailyDigest(): Promise<void> {
    return this.wrap('daily-digest', async () => {
      await this.dailyReport.sendDailyDigest();
    });
  }

  private async wrap(job: string, fn: () => Promise<void>): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug(`scheduler disabled → skip ${job}`);
      return;
    }
    const startedAt = Date.now();
    try {
      await fn();
      this.logger.log(`job ${job} done (${Date.now() - startedAt}ms)`);
    } catch (error) {
      this.logger.error(`job ${job} failed: ${error}`);
      await this.notifier.notifyFailure(job, error);
    }
  }

  private isEnabled(): boolean {
    return this.config.get<boolean>('scheduler.enabled') ?? true;
  }

  private async getPortfolioIds(): Promise<number[]> {
    const { rows } = await this.db.query<{ id: string }>(
      'SELECT id FROM portfolio ORDER BY id',
    );
    return rows.map((r) => Number(r.id));
  }
}
