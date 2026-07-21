import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import { DatabaseService } from './database.service';

/**
 * 전역 DB 모듈. pg Pool 을 생성해 PG_POOL 토큰으로 제공하고,
 * DatabaseService 를 통해 애플리케이션 전역에서 사용한다.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
        }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
