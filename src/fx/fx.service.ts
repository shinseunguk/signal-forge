import { Inject, Injectable } from '@nestjs/common';
import { FX_RATE_PROVIDER } from './fx-rate-provider.interface';
import type { FxRateProvider } from './fx-rate-provider.interface';

/** 환율 조회·환전 유틸. */
@Injectable()
export class FxService {
  constructor(
    @Inject(FX_RATE_PROVIDER) private readonly provider: FxRateProvider,
  ) {}

  get source(): string {
    return this.provider.source;
  }

  /** 1 base 당 quote 환율. 예: getRate('USD','KRW') → 1350. */
  getRate(base: string, quote: string): Promise<number> {
    if (base === quote) return Promise.resolve(1);
    return this.provider.getRate(base, quote);
  }

  /** amount(base 통화)를 quote 통화로 환전한 금액. */
  async convert(amount: number, base: string, quote: string): Promise<number> {
    const rate = await this.getRate(base, quote);
    return amount * rate;
  }
}
