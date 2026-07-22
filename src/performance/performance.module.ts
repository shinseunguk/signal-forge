import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PerformanceService } from './performance.service';

/**
 * 성과 분석 모듈. 밸류에이션(Portfolio)과 과거 캔들(Market)에 의존한다.
 */
@Module({
  imports: [PortfolioModule, MarketModule],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
