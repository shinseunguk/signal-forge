import { MarketSessionService } from './market-session';

describe('MarketSessionService (US)', () => {
  const svc = new MarketSessionService();

  // 2026-07-22 = 여름(EDT, UTC-4). 09:30 EDT = 13:30 UTC.
  it('여름: 13:30Z 는 본장(REGULAR)', () => {
    expect(svc.getSession('US', new Date('2026-07-22T13:30:00Z'))).toBe('REGULAR');
  });
  it('여름: 12:00Z(08:00 EDT)는 프리마켓', () => {
    expect(svc.getSession('US', new Date('2026-07-22T12:00:00Z'))).toBe('PRE');
  });
  it('여름: 21:00Z(17:00 EDT)는 애프터마켓', () => {
    expect(svc.getSession('US', new Date('2026-07-22T21:00:00Z'))).toBe('AFTER');
  });
  it('여름: 06:00Z(02:00 EDT)는 CLOSED', () => {
    expect(svc.getSession('US', new Date('2026-07-22T06:00:00Z'))).toBe('CLOSED');
  });

  // 2026-01-21 = 겨울(EST, UTC-5). 09:30 EST = 14:30 UTC.
  // → 같은 13:30Z 라도 겨울엔 08:30 EST = 프리마켓 (DST 자동 반영 확인)
  it('겨울: 13:30Z 는 프리마켓 (DST 반영)', () => {
    expect(svc.getSession('US', new Date('2026-01-21T13:30:00Z'))).toBe('PRE');
  });
  it('겨울: 14:30Z(09:30 EST)는 본장', () => {
    expect(svc.getSession('US', new Date('2026-01-21T14:30:00Z'))).toBe('REGULAR');
  });

  it('주말은 CLOSED', () => {
    // 2026-07-19 일요일
    expect(svc.getSession('US', new Date('2026-07-19T14:00:00Z'))).toBe('CLOSED');
  });
});

describe('MarketSessionService (KRX)', () => {
  const svc = new MarketSessionService();
  // 2026-07-22 수요일. 09:00 KST = 00:00 UTC, 15:30 KST = 06:30 UTC.
  it('01:00Z(10:00 KST)는 본장', () => {
    expect(svc.getSession('KRX', new Date('2026-07-22T01:00:00Z'))).toBe('REGULAR');
  });
  it('07:00Z(16:00 KST)는 CLOSED', () => {
    expect(svc.getSession('KRX', new Date('2026-07-22T07:00:00Z'))).toBe('CLOSED');
  });
});
