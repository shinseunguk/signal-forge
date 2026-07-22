import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IngestionService } from './ingestion/ingestion.service';
import { DOCUMENT_SOURCES } from './ingestion/document-source.interface';
import { MockDartSource } from './ingestion/mock-dart.source';
import { MockNewsSource } from './ingestion/mock-news.source';
import { TaggingService } from './tagging/tagging.service';
import { LLM_TAGGER } from './tagging/llm-tagger.interface';
import { MockLlmTagger } from './tagging/mock-llm-tagger';
import { ClaudeLlmTagger } from './tagging/claude-llm-tagger';
import { SignalsService } from './signals.service';

/**
 * 시그널 모듈. 수집 소스와 LLM 태거를 구성한다.
 * SIGNAL_TAGGER(default mock)로 태거를 선택. 실 LLM 스펙 확정 전까지 mock 사용.
 */
@Module({
  providers: [
    MockDartSource,
    MockNewsSource,
    {
      provide: DOCUMENT_SOURCES,
      inject: [MockDartSource, MockNewsSource],
      useFactory: (dart: MockDartSource, news: MockNewsSource) => [dart, news],
    },
    IngestionService,

    MockLlmTagger,
    ClaudeLlmTagger,
    {
      provide: LLM_TAGGER,
      inject: [ConfigService, MockLlmTagger, ClaudeLlmTagger],
      useFactory: (
        config: ConfigService,
        mock: MockLlmTagger,
        claude: ClaudeLlmTagger,
      ) => {
        const tagger = config.get<string>('signals.tagger') ?? 'mock';
        return tagger === 'claude' ? claude : mock;
      },
    },
    TaggingService,

    SignalsService,
  ],
  exports: [SignalsService, TaggingService, IngestionService],
})
export class SignalsModule {}
