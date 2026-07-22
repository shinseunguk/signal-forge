import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { PortfolioService } from './portfolio.service';

/**
 * 포트폴리오 모듈. 밸류에이션에 현재가가 필요하므로 MarketModule 에 의존한다.
 * DatabaseModule 은 전역이므로 별도 import 없이 사용.
 */
@Module({
  imports: [MarketModule],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
