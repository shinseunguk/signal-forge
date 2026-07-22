import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  EVENT_CATEGORIES,
  EventCategory,
  RawDoc,
  TagResult,
} from '../signals.types';
import { LlmTagger } from './llm-tagger.interface';

/**
 * 결정론적 Mock 태거. 실제 LLM 키 없이 파이프라인을 검증한다.
 * 같은 원문에는 항상 같은 태깅 결과를 반환한다(재현성, §1-2).
 * 종목(symbol)이 없는 문서는 null 을 반환해 스킵 경로를 재현한다.
 */
@Injectable()
export class MockLlmTagger implements LlmTagger {
  readonly model = 'mock-tagger-v1';

  tag(doc: RawDoc): Promise<TagResult | null> {
    if (!doc.symbol || !doc.market) {
      return Promise.resolve(null); // 종목 특정 불가 → 스킵
    }

    const h = this.hash(doc.rawHash);
    const sentimentScore = Math.round(((h % 2001) / 1000 - 1) * 1000) / 1000; // -1..1
    const confidence = Math.round((0.5 + (h % 500) / 1000) * 1000) / 1000; // 0.5..0.999
    const eventCategory: EventCategory =
      EVENT_CATEGORIES[h % EVENT_CATEGORIES.length];

    return Promise.resolve({
      symbol: doc.symbol,
      market: doc.market,
      sentimentScore,
      eventCategory,
      confidence,
      summary: doc.rawText.slice(0, 100),
    });
  }

  private hash(input: string): number {
    const hex = createHash('sha256').update(input).digest('hex').slice(0, 12);
    return parseInt(hex, 16);
  }
}
