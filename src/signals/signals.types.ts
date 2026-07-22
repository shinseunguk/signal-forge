import { createHash } from 'node:crypto';
import { Market } from '../market/market.types';

export type SignalSource = 'DART' | 'NEWS';

export type EventCategory =
  | 'EARNINGS'
  | 'REGULATION'
  | 'MnA'
  | 'GUIDANCE'
  | 'LAWSUIT'
  | 'OTHER';

export const EVENT_CATEGORIES: EventCategory[] = [
  'EARNINGS',
  'REGULATION',
  'MnA',
  'GUIDANCE',
  'LAWSUIT',
  'OTHER',
];

/** 수집된 원문 문서 (태깅 전). */
export interface RawDoc {
  source: SignalSource;
  externalRef?: string;
  rawText: string;
  /** 사전 식별된 종목(있으면). 없으면 태깅 단계에서 판정하거나 스킵. */
  symbol?: string;
  market?: Market;
  publishedAt: Date;
  rawHash: string;
}

/** LLM 태깅 결과 (구조화 시그널). */
export interface TagResult {
  symbol: string;
  market: Market;
  sentimentScore: number; // -1 ~ 1 (기사 논조)
  eventCategory: EventCategory;
  confidence: number; // 0 ~ 1
  summary: string;
}

/** 저장된 시그널(부분). */
export interface StoredSignal {
  id: number;
  symbol: string;
  market: Market;
  eventCategory: EventCategory;
  sentimentScore: number;
  confidence: number;
  publishedAt: Date;
}

/** 원문 해시(중복 수집 방지). source+externalRef+본문 기준. */
export function computeRawHash(
  source: string,
  externalRef: string | undefined,
  rawText: string,
): string {
  return createHash('sha256')
    .update(`${source}|${externalRef ?? ''}|${rawText}`)
    .digest('hex');
}
