import { Injectable } from '@nestjs/common';
import { computeRawHash, RawDoc } from '../signals.types';
import { DocumentSource } from './document-source.interface';

/**
 * Mock 뉴스 소스. 종목이 특정되지 않는 문서도 포함해 태깅 단계의 "스킵" 경로를 검증한다.
 */
@Injectable()
export class MockNewsSource implements DocumentSource {
  readonly name = 'mock-news';

  private readonly samples: Array<Omit<RawDoc, 'rawHash' | 'publishedAt'>> = [
    {
      source: 'NEWS',
      externalRef: 'https://news.example.com/aapl-guidance',
      symbol: 'AAPL',
      market: 'US',
      rawText:
        'Apple raises quarterly revenue guidance amid strong services growth.',
    },
    {
      source: 'NEWS',
      externalRef: 'https://news.example.com/market-overview',
      // symbol 없음 → 종목 특정 불가 → 태깅 단계에서 스킵되어야 함
      rawText:
        'US stocks closed mixed as investors weighed the latest inflation data.',
    },
  ];

  collect(): Promise<RawDoc[]> {
    const publishedAt = new Date();
    const docs = this.samples.map((s) => ({
      ...s,
      publishedAt,
      rawHash: computeRawHash(s.source, s.externalRef, s.rawText),
    }));
    return Promise.resolve(docs);
  }
}
