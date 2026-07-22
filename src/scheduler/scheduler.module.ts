import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { SignalsModule } from '../signals/signals.module';
import { StrategyModule } from '../strategy/strategy.module';
import { PerformanceModule } from '../performance/performance.module';
import { SchedulerService } from './scheduler.service';
import { DailyReportService } from './daily-report.service';

/**
 * 스케줄러 모듈. cron 잡이 각 도메인 서비스를 호출한다.
 * 알림(NOTIFIER)은 전역 NotificationModule 에서 제공. ScheduleModule.forRoot 는 AppModule.
 */
@Module({
  imports: [SignalsModule, StrategyModule, PortfolioModule, PerformanceModule],
  providers: [SchedulerService, DailyReportService],
  exports: [SchedulerService, DailyReportService],
})
export class SchedulerModule {}
