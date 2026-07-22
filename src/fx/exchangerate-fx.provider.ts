import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FxRateProvider } from './fx-rate-provider.interface';

/**
 * 실 환율 API 기반 제공자 (스켈레톤).
 * 환율 API(예: exchangerate.host, 한국수출입은행 등) 확정 후 구현.
 * 현재는 FX_PROVIDER=mock 를 사용한다.
 */
@Injectable()
export class ExchangeRateFxProvider implements FxRateProvider {
  readonly source = 'exchangerate';
  private readonly logger = new Logger(ExchangeRateFxProvider.name);

  constructor(private readonly config: ConfigService) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getRate(base: string, quote: string): Promise<number> {
    const apiKey = this.config.get<string>('FX_API_KEY');
    if (!apiKey) {
      this.logger.warn('FX_API_KEY 가 설정되지 않았습니다.');
    }
    throw new NotImplementedException(
      'ExchangeRateFxProvider 는 환율 API 확정 후 구현됩니다. 현재는 FX_PROVIDER=mock 를 사용하세요.',
    );
  }
}
