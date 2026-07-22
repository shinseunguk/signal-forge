/** FxRateProvider 구현체 주입 토큰. */
export const FX_RATE_PROVIDER = 'FX_RATE_PROVIDER';

/**
 * 환율 제공자 추상화. 예: getRate('USD','KRW') → 1 USD 당 KRW.
 * 구현체: MockFxProvider(기본, 결정론) / 실 API(스켈레톤).
 */
export interface FxRateProvider {
  readonly source: string;
  getRate(base: string, quote: string): Promise<number>;
}
