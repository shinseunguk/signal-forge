import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NOTIFIER } from '../notification/notifier.interface';
import type { Notifier } from '../notification/notifier.interface';
import { PerformanceService } from '../performance/performance.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { JournalEntry } from '../performance/performance.types';

function krw(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}
function signed(value: number, unit: string): string {
  const s = value >= 0 ? '+' : '';
  return `${s}${value.toLocaleString('ko-KR')}${unit}`;
}

/**
 * 일일 다이제스트: 총평가액·수익금액·수익률·오늘 매매·시그널 예측력을 알림 채널로 전송.
 */
@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(
    private readonly performance: PerformanceService,
    private readonly portfolio: PortfolioService,
    private readonly db: DatabaseService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  /** 모든 포트폴리오에 대해 일일 다이제스트를 전송한다. */
  async sendDailyDigest(at: Date = new Date()): Promise<void> {
    const { rows } = await this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM portfolio ORDER BY id',
    );
    for (const row of rows) {
      const text = await this.buildDigest(Number(row.id), row.name, at);
      await this.notifier.send(text);
    }
    this.logger.log(`일일 다이제스트 전송 (${rows.length} 포트폴리오, ${this.notifier.channel})`);
  }

  /** 단일 포트폴리오 다이제스트 메시지 생성. */
  async buildDigest(
    portfolioId: number,
    name: string,
    at: Date,
  ): Promise<string> {
    const report = await this.performance.portfolioReport(portfolioId);
    const journal = await this.performance.tradingJournal(portfolioId, at);
    const efficacy = await this.performance.signalEfficacyReport();

    const profit = Math.round(report.currentValue - report.initialCash);
    const dateStr = this.dateStr(at);

    const lines: string[] = [];
    lines.push(`📊 **[signal-forge] ${dateStr} 일일 리포트 — ${name}**`);
    lines.push(
      `💰 총평가액: ${krw(report.currentValue)} (수익 ${signed(profit, '원')}, ${signed(report.returnPct, '%')})`,
    );
    lines.push(
      `📉 MDD ${report.maxDrawdownPct}% · 마찰비용 누적 ${krw(report.totalFriction)} · 주문 ${report.orderCount}건(매수 ${report.buyCount}/매도 ${report.sellCount})`,
    );
    lines.push('');
    lines.push(this.journalSection(journal));

    const eff = this.efficacySection(efficacy.byCategory);
    if (eff) {
      lines.push('');
      lines.push(eff);
    }
    return lines.join('\n');
  }

  private journalSection(journal: JournalEntry[]): string {
    if (journal.length === 0) {
      return '📝 오늘 매매: 없음';
    }
    const rows = journal.map((j) => {
      const kind = j.side === 'BUY' ? '매수' : '매도';
      const cost = j.fee + j.tax;
      return `• ${kind} ${j.symbol} ${j.quantity}주 @${krw(j.fillPrice)} (비용 ${krw(cost)})`;
    });
    return [`📝 오늘 매매 (${journal.length}건)`, ...rows].join('\n');
  }

  private efficacySection(
    byCategory: Array<{
      key: string;
      horizonDays: number;
      count: number;
      avgReturnPct: number;
      winRatePct: number;
    }>,
  ): string | null {
    // 5일 horizon 기준 평균 수익률 상위 3개.
    const h5 = byCategory
      .filter((b) => b.horizonDays === 5)
      .sort((a, b) => b.avgReturnPct - a.avgReturnPct)
      .slice(0, 3);
    if (h5.length === 0) return null;
    const rows = h5.map(
      (b) =>
        `• ${b.key}: 5일 평균 ${signed(b.avgReturnPct, '%')} (승률 ${b.winRatePct}%, n=${b.count})`,
    );
    return ['🧠 시그널 예측력(5일)', ...rows].join('\n');
  }

  private dateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
