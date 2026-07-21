import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketService } from './market.service';
import { QUOTE_PROVIDER } from './quote-provider.interface';
import { MockQuoteProvider } from './providers/mock-quote.provider';
import { TossQuoteProvider } from './providers/toss-quote.provider';

/**
 * 시세 모듈. MARKET_PROVIDER 설정으로 구현체를 선택한다(default: mock).
 * 토스 실 API 스펙 확정 전까지는 mock 을 사용한다.
 */
@Module({
  providers: [
    MockQuoteProvider,
    TossQuoteProvider,
    {
      provide: QUOTE_PROVIDER,
      inject: [ConfigService, MockQuoteProvider, TossQuoteProvider],
      useFactory: (
        config: ConfigService,
        mock: MockQuoteProvider,
        toss: TossQuoteProvider,
      ) => {
        const provider = config.get<string>('market.provider') ?? 'mock';
        return provider === 'toss' ? toss : mock;
      },
    },
    MarketService,
  ],
  exports: [MarketService],
})
export class MarketModule {}
