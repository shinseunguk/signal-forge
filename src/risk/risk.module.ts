import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { RiskGateService } from './risk-gate.service';

/**
 * 리스크 게이트 모듈. 밸류에이션(Portfolio)과 현재가(Market)에 의존한다.
 */
@Module({
  imports: [PortfolioModule, MarketModule],
  providers: [RiskGateService],
  exports: [RiskGateService],
})
export class RiskModule {}
