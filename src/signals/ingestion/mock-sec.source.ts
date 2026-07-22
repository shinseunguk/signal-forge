import { Injectable } from '@nestjs/common';
import { computeRawHash, RawDoc } from '../signals.types';
import { DocumentSource } from './document-source.interface';

/**
 * Mock SEC 공시 소스. 실제 SEC EDGAR API 스펙/키 확정 전까지 결정론적 샘플을 제공한다.
 * 각 실행마다 "그 시점 기준" 문서를 만들되, rawHash 는 내용 기반이라 중복 수집을 방지한다.
 */
@Injectable()
export class MockSecSource implements DocumentSource {
  readonly name = 'mock-sec';

  private readonly samples: Array<Omit<RawDoc, 'rawHash' | 'publishedAt'>> = [
    {
      source: 'SEC',
      externalRef: 'SEC-2026-0001',
      symbol: 'AAPL',
      market: 'US',
      rawText:
        'Apple Inc. files Form 8-K reporting record quarterly earnings, driven by services and iPhone demand.',
    },
    {
      source: 'SEC',
      externalRef: 'SEC-2026-0002',
      symbol: 'NVDA',
      market: 'US',
      rawText:
        'NVIDIA Corporation announces a $25B share repurchase program in its latest 8-K filing.',
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
