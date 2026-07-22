import { RawDoc, TagResult } from '../signals.types';

/** LlmTagger 구현체 주입 토큰. */
export const LLM_TAGGER = 'LLM_TAGGER';

/**
 * 원문을 구조화 시그널로 태깅하는 LLM 추상화.
 * LLM 은 판단하지 않고 태깅만 한다(기획서 §1-2). 종목 특정 불가 시 null 을 반환한다.
 */
export interface LlmTagger {
  /** 태깅에 사용한 모델 식별자 (signal.model 에 기록). */
  readonly model: string;
  tag(doc: RawDoc): Promise<TagResult | null>;
}
