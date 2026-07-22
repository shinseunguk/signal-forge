import 'dotenv/config';
import { Client } from 'pg';

/**
 * market_calendar 시드. 지정 기간의 세션을 생성한다.
 * 기본 규칙: 주말(토/일) = 휴장, 평일 = 개장.
 * 공휴일은 아래 HOLIDAYS 에 명시한 날짜를 휴장으로 덮어쓴다(유지보수 필요).
 *
 * 환경변수: CALENDAR_FROM / CALENDAR_TO (YYYY-MM-DD). 기본 2026 한 해.
 */
const MARKETS = ['KRX', 'US'] as const;

// ⚠️ 공휴일 목록은 정본이 아니며 매년 갱신해야 한다. 필요 시 여기에 'YYYY-MM-DD' 추가.
const HOLIDAYS: Record<(typeof MARKETS)[number], string[]> = {
  KRX: [],
  US: [],
};

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL 환경변수가 필요합니다.');

  const from = new Date(process.env.CALENDAR_FROM ?? '2026-01-01');
  const to = new Date(process.env.CALENDAR_TO ?? '2026-12-31');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    let inserted = 0;
    for (const market of MARKETS) {
      const holidays = new Set(HOLIDAYS[market]);
      for (
        let t = new Date(from);
        t <= to;
        t = new Date(t.getTime() + 24 * 60 * 60 * 1000)
      ) {
        const dateStr = toDateString(t);
        const day = t.getDay();
        const isWeekend = day === 0 || day === 6;
        const isOpen = !isWeekend && !holidays.has(dateStr);
        const res = await client.query(
          `INSERT INTO market_calendar (market, session_date, is_open)
           VALUES ($1, $2, $3)
           ON CONFLICT (market, session_date) DO NOTHING`,
          [market, dateStr, isOpen],
        );
        inserted += res.rowCount ?? 0;
      }
    }
    console.log(
      `[seed-calendar] ${toDateString(from)} ~ ${toDateString(to)} 세션 ${inserted}행 생성`,
    );
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('[seed-calendar] failed:', error);
  process.exit(1);
});
