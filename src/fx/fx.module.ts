import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FX_RATE_PROVIDER } from './fx-rate-provider.interface';
import { MockFxProvider } from './mock-fx.provider';
import { ExchangeRateFxProvider } from './exchangerate-fx.provider';
import { FxService } from './fx.service';

/**
 * 환율 모듈. FX_PROVIDER(default mock)로 구현체를 선택한다.
 */
@Module({
  providers: [
    MockFxProvider,
    ExchangeRateFxProvider,
    {
      provide: FX_RATE_PROVIDER,
      inject: [ConfigService, MockFxProvider, ExchangeRateFxProvider],
      useFactory: (
        config: ConfigService,
        mock: MockFxProvider,
        real: ExchangeRateFxProvider,
      ) => {
        const provider = config.get<string>('fx.provider') ?? 'mock';
        return provider === 'exchangerate' ? real : mock;
      },
    },
    FxService,
  ],
  exports: [FxService],
})
export class FxModule {}
