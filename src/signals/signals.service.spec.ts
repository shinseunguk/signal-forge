import { DatabaseService } from '../database/database.service';
import { IngestionService } from './ingestion/ingestion.service';
import { TaggingService } from './tagging/tagging.service';
import { SignalsService } from './signals.service';
import { RawDoc } from './signals.types';

function doc(hash: string, symbol?: string): RawDoc {
  return {
    source: 'NEWS',
    externalRef: `ref-${hash}`,
    rawText: `text-${hash}`,
    symbol,
    market: symbol ? 'KRX' : undefined,
    publishedAt: new Date('2026-07-20T00:00:00Z'),
    rawHash: hash,
  };
}

describe('SignalsService', () => {
  let db: { query: jest.Mock };
  let ingestion: { collectAll: jest.Mock };
  let tagging: { tag: jest.Mock };
  let service: SignalsService;

  beforeEach(() => {
    db = { query: jest.fn() };
    ingestion = { collectAll: jest.fn() };
    tagging = { tag: jest.fn() };
    service = new SignalsService(
      ingestion as unknown as IngestionService,
      tagging as unknown as TaggingService,
      db as unknown as DatabaseService,
    );
  });

  it('이미 저장된 raw_hash 는 태깅하지 않고, 신규만 태깅한다', async () => {
    ingestion.collectAll.mockResolvedValue([
      doc('h1', '005930'),
      doc('h2', 'AAPL'),
      doc('h3'), // 종목 없음 → 태깅 시 스킵
    ]);
    // h1 은 이미 존재
    db.query.mockResolvedValue({ rows: [{ raw_hash: 'h1' }], rowCount: 1 });
    // h2 저장 성공, h3 스킵(null)
    tagging.tag
      .mockResolvedValueOnce({ id: 2 }) // h2
      .mockResolvedValueOnce(null); // h3

    const result = await service.ingestAndTag();

    expect(result.collected).toBe(3);
    expect(result.fresh).toBe(2); // h2, h3 (h1 제외)
    expect(result.stored).toBe(1); // h2 만 저장
    expect(result.skipped).toBe(1); // h3
    expect(tagging.tag).toHaveBeenCalledTimes(2);
  });

  it('수집 0건이면 태깅을 시도하지 않는다', async () => {
    ingestion.collectAll.mockResolvedValue([]);
    const result = await service.ingestAndTag();
    expect(result.collected).toBe(0);
    expect(result.stored).toBe(0);
    expect(tagging.tag).not.toHaveBeenCalled();
  });
});
