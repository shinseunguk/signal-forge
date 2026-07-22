import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { IngestionService } from './ingestion/ingestion.service';
import { TaggingService } from './tagging/tagging.service';
import { RawDoc } from './signals.types';

export interface IngestResult {
  collected: number;
  fresh: number;
  stored: number;
  skipped: number;
}

/**
 * 수집 → 중복 제거 → 태깅 → 저장 파이프라인 (스케줄러가 호출).
 */
@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(
    private readonly ingestion: IngestionService,
    private readonly tagging: TaggingService,
    private readonly db: DatabaseService,
  ) {}

  async ingestAndTag(): Promise<IngestResult> {
    const docs = await this.ingestion.collectAll();
    const fresh = await this.filterUnseen(docs);

    let stored = 0;
    for (const doc of fresh) {
      const signal = await this.tagging.tag(doc);
      if (signal) stored += 1;
    }

    const result: IngestResult = {
      collected: docs.length,
      fresh: fresh.length,
      stored,
      skipped: fresh.length - stored,
    };
    this.logger.log(
      `ingestAndTag: collected=${result.collected} fresh=${result.fresh} stored=${result.stored} skipped=${result.skipped}`,
    );
    return result;
  }

  /** 이미 signal 에 존재하는 raw_hash 를 제거해 태깅 비용을 줄인다. */
  private async filterUnseen(docs: RawDoc[]): Promise<RawDoc[]> {
    if (docs.length === 0) return [];
    const hashes = docs.map((d) => d.rawHash);
    const { rows } = await this.db.query<{ raw_hash: string }>(
      'SELECT raw_hash FROM signal WHERE raw_hash = ANY($1)',
      [hashes],
    );
    const seen = new Set(rows.map((r) => r.raw_hash));
    return docs.filter((d) => !seen.has(d.rawHash));
  }
}
