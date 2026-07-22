import { RawDoc } from '../signals.types';

/** 여러 DocumentSource 구현체를 배열로 주입하기 위한 토큰. */
export const DOCUMENT_SOURCES = 'DOCUMENT_SOURCES';

/** 원문 수집 소스 추상화 (DART 공시 / 뉴스 등). */
export interface DocumentSource {
  readonly name: string;
  collect(): Promise<RawDoc[]>;
}
