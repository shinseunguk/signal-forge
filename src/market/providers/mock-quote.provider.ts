import { Injectable } from '@nestjs/common';
import { Candle, Market, Quote } from '../market.types';
import { QuoteProvider } from '../quote-provider.interface';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_CANDLES = 400;

/**
 * 결정론적 Mock 시세 제공자.
 * 실제 토스 API 스펙 확정 전까지 다운스트림(포트폴리오 밸류에이션, 성과 평가)을 언블록한다.
 *
 * 같은 (symbol, 날짜) 입력에는 항상 같은 값을 반환한다 → 재현성 보장(기획서 §1-2).
 * Math.random 을 쓰지 않고 심볼/일자 해시로 값을 유도한다.
 */
@Injectable()
export class MockQuoteProvider implements QuoteProvider {
  readonly source = 'mock';

  getPrice(symbol: string, market: Market): Promise<Quote> {
    const capturedAt = new Date();
    const price = this.priceOn(symbol, market, capturedAt);
    return Promise.resolve({ symbol, market, price, capturedAt });
  }

  getCandles(
    symbol: string,
    market: Market,
    from: Date,
    to: Date,
  ): Promise<Candle[]> {
    const candles: Candle[] = [];
    const start = this.startOfDay(from).getTime();
    const end = this.startOfDay(to).getTime();

    let count = 0;
    for (let t = start; t <= end && count < MAX_CANDLES; t += MS_PER_DAY) {
      const day = new Date(t);
      const close = this.priceOn(symbol, market, day);
      const open = this.round(close * (1 + this.wiggle(symbol, day, 1) * 0.01));
      const high = this.round(Math.max(open, close) * (1 + 0.005));
      const low = this.round(Math.min(open, close) * (1 - 0.005));
      const volume = 10_000 + (this.hash(`${symbol}:${t}:vol`) % 990_000);

      candles.push({
        symbol,
        market,
        open,
        high,
        low,
        close,
        volume,
        timestamp: day,
      });
      count += 1;
    }

    return Promise.resolve(candles);
  }

  /** 심볼과 일자에 따라 결정론적으로 산출한 종가. */
  private priceOn(symbol: string, market: Market, when: Date): number {
    const dayKey = this.startOfDay(when).getTime();
    const base = this.basePrice(symbol, market);
    // ±3% 범위의 결정론적 일간 변동.
    const drift = this.wiggle(`${symbol}:${dayKey}`, when, 2) * 0.03;
    return this.round(base * (1 + drift));
  }

  /** 심볼 고유의 기준가. KRX 는 원, US 는 달러 스케일. */
  private basePrice(symbol: string, market: Market): number {
    const h = this.hash(symbol);
    if (market === 'US') {
      return 20 + (h % 480); // 20 ~ 499 USD
    }
    return 10_000 + (h % 290_000); // 10,000 ~ 299,999 KRW
  }

  /** -1.0 ~ 1.0 범위의 결정론적 값. */
  private wiggle(seed: string, when: Date, salt: number): number {
    const h = this.hash(`${seed}:${when.getTime()}:${salt}`);
    return (h % 2001) / 1000 - 1; // 0..2000 → -1.0..1.0
  }

  private hash(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
