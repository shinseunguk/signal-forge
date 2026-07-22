import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { MarketModule } from './market/market.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { ExecutionModule } from './execution/execution.module';
import { RiskModule } from './risk/risk.module';
import { SignalsModule } from './signals/signals.module';
import { StrategyModule } from './strategy/strategy.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    MarketModule,
    PortfolioModule,
    ExecutionModule,
    RiskModule,
    SignalsModule,
    StrategyModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
