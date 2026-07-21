import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { PG_POOL } from './database.constants';

/**
 * pg Pool 을 감싼 얇은 DB 접근 계층.
 * - 단순 조회는 query()
 * - 원자적 갱신(예: 페이퍼 주문 → 현금·포지션 갱신)은 withTransaction()
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  /** 단일 트랜잭션 안에서 콜백을 실행한다. 예외 발생 시 롤백한다. */
  async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.pool.end();
  }
}
