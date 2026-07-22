import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FxRateProvider } from './fx-rate-provider.interface';

const BASE_USD_KRW = 1350; // 기준 환율

/**
 * 결정론적 Mock 환율. 실 API 없이 파이프라인·리포트를 검증한다.
 * 같은 날짜에는 같은 값을 반환하고, 날짜에 따라 ±3% 내에서 결정론적으로 변한다.
 */
@Injectable()
export class MockFxProvider implements FxRateProvider {
  readonly source = 'mock';

  getRate(base: string, quote: string): Promise<number> {
    const pair = `${base}/${quote}`;
    const day = this.startOfDay(new Date());
    const rate = this.rateFor(pair, day);
    return Promise.resolve(rate);
  }

  private rateFor(pair: string, dayMs: number): number {
    if (pair === 'USD/KRW') {
      const drift = this.wiggle(`${pair}:${dayMs}`) * 0.03; // ±3%
      return this.round(BASE_USD_KRW * (1 + drift), 2);
    }
    if (pair === 'KRW/USD') {
      const usdKrw = this.rateFor('USD/KRW', dayMs);
      return this.round(1 / usdKrw, 8);
    }
    // 동일 통화 등은 1로 처리.
    return 1;
  }

  /** -1.0 ~ 1.0 결정론적 값. */
  private wiggle(seed: string): number {
    const hex = createHash('sha256').update(seed).digest('hex').slice(0, 12);
    const n = parseInt(hex, 16);
    return (n % 2001) / 1000 - 1;
  }

  private startOfDay(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  private round(v: number, decimals: number): number {
    const f = 10 ** decimals;
    return Math.round(v * f) / f;
  }
}
