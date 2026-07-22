import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { MarketModule } from './market/market.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { ExecutionModule } from './execution/execution.module';
import { RiskModule } from './risk/risk.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    DatabaseModule,
    MarketModule,
    PortfolioModule,
    ExecutionModule,
    RiskModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
