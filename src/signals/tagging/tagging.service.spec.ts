import { DatabaseService } from '../../database/database.service';
import { RawDoc } from '../signals.types';
import { LlmTagger } from './llm-tagger.interface';
import { TaggingService } from './tagging.service';

describe('TaggingService', () => {
  let db: { query: jest.Mock };
  let tagger: { model: string; tag: jest.Mock };
  let service: TaggingService;

  const doc: RawDoc = {
    source: 'SEC',
    externalRef: 'SEC-1',
    rawText: 'Apple earnings report',
    symbol: 'AAPL',
    market: 'US',
    publishedAt: new Date('2026-07-20T00:00:00Z'),
    rawHash: 'hash-1',
  };

  beforeEach(() => {
    db = { query: jest.fn() };
    tagger = { model: 'mock-tagger-v1', tag: jest.fn() };
    service = new TaggingService(
      tagger as unknown as LlmTagger,
      db as unknown as DatabaseService,
    );
  });

  it('종목 불명(tagger null)이면 스킵하고 저장하지 않는다', async () => {
    tagger.tag.mockResolvedValue(null);
    const result = await service.tag(doc);
    expect(result).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('태깅 결과를 published_at 기준으로 signal 에 저장한다', async () => {
    tagger.tag.mockResolvedValue({
      symbol: 'AAPL',
      market: 'US',
      sentimentScore: 0.42,
      eventCategory: 'EARNINGS',
      confidence: 0.8,
      summary: '요약',
    });
    db.query.mockResolvedValue({ rows: [{ id: '10' }], rowCount: 1 });

    const result = await service.tag(doc);
    expect(result?.id).toBe(10);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO signal');
    expect(sql).toContain('ON CONFLICT (raw_hash) DO NOTHING');
    expect(params[2]).toBe('hash-1'); // raw_hash
    expect(params[10]).toEqual(doc.publishedAt); // published_at
  });

  it('중복 raw_hash(저장 0행)면 null 을 반환한다', async () => {
    tagger.tag.mockResolvedValue({
      symbol: 'AAPL',
      market: 'US',
      sentimentScore: 0.1,
      eventCategory: 'OTHER',
      confidence: 0.6,
      summary: 's',
    });
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await service.tag(doc);
    expect(result).toBeNull();
  });

  it('범위를 벗어난 sentiment/confidence 는 clamp 된다', async () => {
    tagger.tag.mockResolvedValue({
      symbol: 'AAPL',
      market: 'US',
      sentimentScore: 2.5, // → 1
      eventCategory: 'OTHER',
      confidence: 1.9, // → 1
      summary: 's',
    });
    db.query.mockResolvedValue({ rows: [{ id: '11' }], rowCount: 1 });
    await service.tag(doc);
    const params = db.query.mock.calls[0][1];
    expect(params[5]).toBe(1); // sentiment_score clamp
    expect(params[7]).toBe(1); // confidence clamp
  });
});
