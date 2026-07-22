import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { SignalsModule } from '../signals/signals.module';
import { StrategyModule } from '../strategy/strategy.module';
import { SchedulerService } from './scheduler.service';
import { SlackNotifier } from './slack-notifier.service';

/**
 * 스케줄러 모듈. cron 잡이 각 도메인 서비스를 호출한다.
 * (ScheduleModule.forRoot 는 AppModule 에서 전역 등록)
 */
@Module({
  imports: [SignalsModule, StrategyModule, PortfolioModule],
  providers: [SchedulerService, SlackNotifier],
  exports: [SchedulerService, SlackNotifier],
})
export class SchedulerModule {}
