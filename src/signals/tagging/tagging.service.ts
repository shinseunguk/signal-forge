import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RawDoc, StoredSignal, TagResult } from '../signals.types';
import { LLM_TAGGER } from './llm-tagger.interface';
import type { LlmTagger } from './llm-tagger.interface';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 원문을 LLM 으로 태깅해 signal 테이블에 저장한다.
 * published_at(원문 발행 시각) 기준으로 저장하고, raw_hash 중복은 무시한다.
 */
@Injectable()
export class TaggingService {
  private readonly logger = new Logger(TaggingService.name);

  constructor(
    @Inject(LLM_TAGGER) private readonly tagger: LlmTagger,
    private readonly db: DatabaseService,
  ) {}

  /** 문서 하나를 태깅·저장한다. 스킵되거나 중복이면 null 을 반환. */
  async tag(doc: RawDoc): Promise<StoredSignal | null> {
    const result = await this.tagger.tag(doc);
    if (!result) {
      this.logger.debug(`태깅 스킵(종목 불명): ${doc.externalRef ?? doc.rawHash}`);
      return null;
    }

    const normalized = this.normalize(result);
    return this.store(doc, normalized);
  }

  private normalize(result: TagResult): TagResult {
    return {
      ...result,
      sentimentScore: clamp(result.sentimentScore, -1, 1),
      confidence: clamp(result.confidence, 0, 1),
    };
  }

  private async store(
    doc: RawDoc,
    result: TagResult,
  ): Promise<StoredSignal | null> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO signal
         (source, external_ref, raw_hash, symbol, market,
          sentiment_score, event_category, confidence, summary, model, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (raw_hash) DO NOTHING
       RETURNING id`,
      [
        doc.source,
        doc.externalRef ?? null,
        doc.rawHash,
        result.symbol,
        result.market,
        result.sentimentScore,
        result.eventCategory,
        result.confidence,
        result.summary,
        this.tagger.model,
        doc.publishedAt,
      ],
    );

    if (rows.length === 0) {
      this.logger.debug(`중복 raw_hash 무시: ${doc.rawHash}`);
      return null;
    }

    return {
      id: Number(rows[0].id),
      symbol: result.symbol,
      market: result.market,
      eventCategory: result.eventCategory,
      sentimentScore: result.sentimentScore,
      confidence: result.confidence,
      publishedAt: doc.publishedAt,
    };
  }
}
