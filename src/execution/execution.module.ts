import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { PaperExecutionService } from './paper-execution.service';

/**
 * 페이퍼 실행 모듈. 체결가 산정을 위해 MarketModule 에 의존한다.
 * DatabaseModule 은 전역.
 */
@Module({
  imports: [MarketModule],
  providers: [PaperExecutionService],
  exports: [PaperExecutionService],
})
export class ExecutionModule {}
