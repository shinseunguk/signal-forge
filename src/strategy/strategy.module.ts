import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { RiskModule } from '../risk/risk.module';
import { ExecutionModule } from '../execution/execution.module';
import { StrategyService } from './strategy.service';
import { StrategyRunnerService } from './strategy-runner.service';

/**
 * 전략 모듈. 규칙 평가(StrategyService)와 실행 오케스트레이션(StrategyRunnerService).
 */
@Module({
  imports: [PortfolioModule, RiskModule, ExecutionModule],
  providers: [StrategyService, StrategyRunnerService],
  exports: [StrategyService, StrategyRunnerService],
})
export class StrategyModule {}
