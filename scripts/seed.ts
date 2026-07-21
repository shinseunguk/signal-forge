import 'dotenv/config';
import { Client } from 'pg';

/** 초기 시드 1억원짜리 가상 포트폴리오 1개를 생성한다 (이미 있으면 스킵). */
async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL 환경변수가 필요합니다.');

  const name = process.env.PORTFOLIO_NAME ?? 'signal-forge-main';
  const initialCash = Number(process.env.PORTFOLIO_INITIAL_CASH ?? 100_000_000);
  if (!Number.isFinite(initialCash) || initialCash <= 0) {
    throw new Error(`PORTFOLIO_INITIAL_CASH 값이 올바르지 않습니다: ${initialCash}`);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM portfolio WHERE name = $1',
      [name],
    );
    if (existing.rowCount) {
      console.log(
        `[seed] portfolio "${name}" already exists (id=${existing.rows[0].id}) — skip`,
      );
      return;
    }

    // 초기에는 현금 잔고 = 초기 시드 전액.
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO portfolio (name, base_currency, initial_cash, cash_balance)
       VALUES ($1, 'KRW', $2, $2)
       RETURNING id`,
      [name, initialCash],
    );
    console.log(
      `[seed] created portfolio "${name}" (id=${inserted.rows[0].id}) with initial_cash=${initialCash}`,
    );
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
