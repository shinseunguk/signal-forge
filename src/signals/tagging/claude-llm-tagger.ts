import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RawDoc, TagResult } from '../signals.types';
import { LlmTagger } from './llm-tagger.interface';

/**
 * Claude 기반 LLM 태거 (스켈레톤).
 *
 * 구현 시 요구사항(기획서 §5.4):
 *  - temperature=0, 프롬프트 고정 → 재현성
 *  - JSON 만 출력하도록 강제(마크다운 펜스 금지), 파싱 실패 시 재시도/스킵
 *  - 종목 특정 불가 시 null 반환(저장 안 함)
 *  - sentiment 는 주가 예측이 아니라 기사 논조만 반영
 *
 * LLM_API_KEY / LLM_MODEL(예: claude-sonnet-5) 확정 후 구현. 현재는 mock 을 사용한다.
 */
@Injectable()
export class ClaudeLlmTagger implements LlmTagger {
  private readonly logger = new Logger(ClaudeLlmTagger.name);

  constructor(private readonly config: ConfigService) {}

  get model(): string {
    return this.config.get<string>('LLM_MODEL') ?? 'claude-sonnet-5';
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tag(doc: RawDoc): Promise<TagResult | null> {
    const apiKey = this.config.get<string>('LLM_API_KEY');
    if (!apiKey) {
      this.logger.warn('LLM_API_KEY 가 설정되지 않았습니다.');
    }
    throw new NotImplementedException(
      'ClaudeLlmTagger 는 LLM_API_KEY/프롬프트 확정 후 구현됩니다. 현재는 SIGNAL_TAGGER=mock 를 사용하세요.',
    );
  }
}
