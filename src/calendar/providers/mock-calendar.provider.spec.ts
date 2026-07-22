import { MockCalendarProvider } from './mock-calendar.provider';

describe('MockCalendarProvider', () => {
  const provider = new MockCalendarProvider();

  it('평일은 개장, 주말은 휴장으로 표시한다', async () => {
    // 2026-07-20(월) ~ 2026-07-26(일)
    const sessions = await provider.getSessions(
      'US',
      new Date(2026, 6, 20),
      new Date(2026, 6, 26),
    );

    const byDate = new Map(sessions.map((s) => [s.sessionDate, s.isOpen]));
    expect(byDate.get('2026-07-20')).toBe(true); // 월
    expect(byDate.get('2026-07-24')).toBe(true); // 금
    expect(byDate.get('2026-07-25')).toBe(false); // 토
    expect(byDate.get('2026-07-26')).toBe(false); // 일
  });

  it('구간 경계를 포함해 하루도 빠짐없이 생성한다', async () => {
    const sessions = await provider.getSessions(
      'US',
      new Date(2026, 0, 1),
      new Date(2026, 0, 7),
    );
    expect(sessions).toHaveLength(7);
    expect(sessions[0].sessionDate).toBe('2026-01-01');
    expect(sessions[6].sessionDate).toBe('2026-01-07');
  });
});
