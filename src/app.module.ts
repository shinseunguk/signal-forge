import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { NotificationModule } from './notification/notification.module';
import { MarketModule } from './market/market.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { ExecutionModule } from './execution/execution.module';
import { RiskModule } from './risk/risk.module';
import { SignalsModule } from './signals/signals.module';
import { StrategyModule } from './strategy/strategy.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { PerformanceModule } from './performance/performance.module';
import { FxModule } from './fx/fx.module';
import { CalendarModule } from './calendar/calendar.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    NotificationModule,
    FxModule,
    CalendarModule,
    MarketModule,
    PortfolioModule,
    ExecutionModule,
    RiskModule,
    SignalsModule,
    StrategyModule,
    PerformanceModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
