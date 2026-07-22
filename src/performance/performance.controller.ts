import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import {
  JournalEntry,
  PortfolioReport,
  SignalEfficacyReport,
} from './performance.types';

/**
 * 대시보드 조회 API (기획서 §9 Phase 10).
 */
@Controller()
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  /** 포트폴리오 성과 리포트. */
  @Get('portfolio/:id/report')
  report(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PortfolioReport> {
    return this.performance.portfolioReport(id);
  }

  /** 당일 매매일지. */
  @Get('portfolio/:id/journal')
  journal(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<JournalEntry[]> {
    return this.performance.tradingJournal(id);
  }

  /** 시그널 유형별 예측력 리포트. */
  @Get('signals/efficacy')
  efficacy(): Promise<SignalEfficacyReport> {
    return this.performance.signalEfficacyReport();
  }
}
