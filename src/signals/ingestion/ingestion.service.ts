import { Inject, Injectable, Logger } from '@nestjs/common';
import { RawDoc } from '../signals.types';
import {
  DOCUMENT_SOURCES,
  DocumentSource,
} from './document-source.interface';

/** 등록된 모든 DocumentSource 에서 원문을 수집한다. */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @Inject(DOCUMENT_SOURCES) private readonly sources: DocumentSource[],
  ) {}

  async collectAll(): Promise<RawDoc[]> {
    const results = await Promise.all(
      this.sources.map(async (source) => {
        try {
          return await source.collect();
        } catch (error) {
          this.logger.error(`source ${source.name} 수집 실패: ${error}`);
          return [] as RawDoc[];
        }
      }),
    );
    const docs = results.flat();
    this.logger.log(`수집 ${docs.length}건 (sources: ${this.sources.length})`);
    return docs;
  }
}
