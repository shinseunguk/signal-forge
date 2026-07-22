import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Candle, Market, Quote } from '../market.types';
import { QuoteProvider } from '../quote-provider.interface';

/**
 * 토스증권 Open API 기반 실 시세 제공자 (읽기 전용).
 *
 * ⚠️ 이 클래스는 **시세/캔들 조회에만** 사용한다. 주문 생성/정정/취소 엔드포인트는
 *    import 조차 하지 않는다(기획서 §1-1). 아래에는 읽기 전용 경로만 존재한다.
 *
 * 토스 Open API 는 롤아웃 단계로 정확한 엔드포인트/파라미터가 확정되지 않았다.
 * (`developers.tossinvest.com` 문서로 최종 확인 필요) 스펙 확정 전까지는 미구현이며,
 * 그때까지는 MockQuoteProvider 를 사용한다(MARKET_PROVIDER=mock).
 */
@Injectable()
export class TossQuoteProvider implements QuoteProvider {
  readonly source = 'toss';
  private readonly logger = new Logger(TossQuoteProvider.name);

  // 읽기 전용 엔드포인트만 정의한다. (주문 엔드포인트 없음)
  private static readonly PRICE_PATH = '/api/v1/prices';
  private static readonly CANDLES_PATH = '/api/v1/candles';

  constructor(private readonly config: ConfigService) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getPrice(symbol: string, market: Market): Promise<Quote> {
    throw new NotImplementedException(
      'TossQuoteProvider.getPrice 는 토스 Open API 스펙 확정 후 구현됩니다. 현재는 MARKET_PROVIDER=mock 를 사용하세요.',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getCandles(
    symbol: string,
    market: Market,
    from: Date,
    to: Date,
  ): Promise<Candle[]> {
    throw new NotImplementedException(
      'TossQuoteProvider.getCandles 는 토스 Open API 스펙 확정 후 구현됩니다. 현재는 MARKET_PROVIDER=mock 를 사용하세요.',
    );
  }

  /**
   * OAuth 2.0 Client Credentials 로 액세스 토큰을 발급/캐싱한다(읽기 전용 스코프).
   * 스펙 확정 후 구현. App Key/Secret 은 ConfigService 로 주입한다.
   */
  private getAccessToken(): Promise<string> {
    const appKey = this.config.get<string>('TOSS_APP_KEY');
    const appSecret = this.config.get<string>('TOSS_APP_SECRET');
    if (!appKey || !appSecret) {
      this.logger.warn('TOSS_APP_KEY/SECRET 이 설정되지 않았습니다.');
    }
    throw new NotImplementedException(
      'TossQuoteProvider.getAccessToken 은 토스 Open API 스펙 확정 후 구현됩니다.',
    );
  }
}
