import 'dotenv/config';
import { Client } from 'pg';

/**
 * 초기 포트폴리오를 생성한다 (이미 있으면 스킵).
 *  - PORTFOLIO_BASE_CURRENCY=USD: 1억 KRW 를 FUNDING_FX_RATE 로 환전한 USD 계좌.
 *  - PORTFOLIO_BASE_CURRENCY=KRW: PORTFOLIO_INITIAL_CASH 원화 계좌.
 */
async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL 환경변수가 필요합니다.');

  const name = process.env.PORTFOLIO_NAME ?? 'signal-forge-main';
  const baseCurrency = (process.env.PORTFOLIO_BASE_CURRENCY ?? 'USD').toUpperCase();

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

    if (baseCurrency === 'USD') {
      const fundingKrw = Number(process.env.PORTFOLIO_FUNDING_KRW ?? 100_000_000);
      const fxRate = Number(process.env.FUNDING_FX_RATE ?? 1350); // KRW per USD
      if (!Number.isFinite(fundingKrw) || fundingKrw <= 0 || fxRate <= 0) {
        throw new Error('PORTFOLIO_FUNDING_KRW / FUNDING_FX_RATE 값이 올바르지 않습니다.');
      }
      const initialUsd = Math.round((fundingKrw / fxRate) * 1e4) / 1e4;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO portfolio
           (name, base_currency, initial_cash, cash_balance, funded_amount, funded_currency, initial_fx_rate)
         VALUES ($1, 'USD', $2, $2, $3, 'KRW', $4)
         RETURNING id`,
        [name, initialUsd, fundingKrw, fxRate],
      );
      console.log(
        `[seed] created USD portfolio "${name}" (id=${inserted.rows[0].id}): ${fundingKrw.toLocaleString()}원 @${fxRate} → $${initialUsd.toLocaleString()}`,
      );
      return;
    }

    // KRW 계좌
    const initialCash = Number(process.env.PORTFOLIO_INITIAL_CASH ?? 100_000_000);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO portfolio (name, base_currency, initial_cash, cash_balance)
       VALUES ($1, 'KRW', $2, $2)
       RETURNING id`,
      [name, initialCash],
    );
    console.log(
      `[seed] created KRW portfolio "${name}" (id=${inserted.rows[0].id}) initial_cash=${initialCash}`,
    );
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
