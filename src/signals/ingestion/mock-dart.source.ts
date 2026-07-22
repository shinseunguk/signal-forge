import { Injectable } from '@nestjs/common';
import { computeRawHash, RawDoc } from '../signals.types';
import { DocumentSource } from './document-source.interface';

/**
 * Mock DART 공시 소스. 실제 DART API 스펙/키 확정 전까지 결정론적 샘플을 제공한다.
 * 각 실행마다 "그 시점 기준" 문서를 만들되, rawHash 는 내용 기반이라 중복 수집을 방지한다.
 */
@Injectable()
export class MockDartSource implements DocumentSource {
  readonly name = 'mock-dart';

  private readonly samples: Array<Omit<RawDoc, 'rawHash' | 'publishedAt'>> = [
    {
      source: 'DART',
      externalRef: 'DART-2026-0001',
      symbol: '005930',
      market: 'KRX',
      rawText:
        '삼성전자, 3분기 잠정 실적 공시 — 영업이익 전년 대비 증가. 반도체 부문 회복.',
    },
    {
      source: 'DART',
      externalRef: 'DART-2026-0002',
      symbol: '000660',
      market: 'KRX',
      rawText:
        'SK하이닉스, 자기주식 취득 신탁계약 체결 결정 공시. 주주가치 제고 목적.',
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
