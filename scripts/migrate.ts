import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

/** 대상 DB 가 없으면 maintenance DB(postgres)에 접속해 생성한다. */
async function ensureDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!dbName) throw new Error('DATABASE_URL 에 데이터베이스 이름이 없습니다.');

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (!rowCount) {
      // 식별자는 파라미터 바인딩이 불가하므로 큰따옴표로 감싼다.
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`[migrate] created database "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL 환경변수가 필요합니다.');

  await ensureDatabase(databaseUrl);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename   TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rowCount } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file],
      );
      if (rowCount) {
        console.log(`[migrate] skip ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] applying ${file} ...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log(`[migrate] applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('[migrate] all migrations complete');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('[migrate] failed:', error);
  process.exit(1);
});
