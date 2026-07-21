import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Candle, Market, Quote } from './market.types';
import { QUOTE_PROVIDER } from './quote-provider.interface';
import type { QuoteProvider } from './quote-provider.interface';

/**
 * 시세 조회 진입점 (읽기 전용).
 * QuoteProvider 에 조회를 위임하고, 현재가는 price_snapshot 에 기록한다(기획서 §5.1).
 */
@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    @Inject(QUOTE_PROVIDER) private readonly provider: QuoteProvider,
    private readonly db: DatabaseService,
  ) {}

  /** 현재가 조회 후 price_snapshot 에 스냅샷을 남긴다. */
  async getPrice(symbol: string, market: Market): Promise<Quote> {
    const quote = await this.provider.getPrice(symbol, market);
    await this.recordSnapshot(quote);
    return quote;
  }

  /** 기간 캔들 조회(과거 가격). 스냅샷 기록 대상이 아니다. */
  getCandles(
    symbol: string,
    market: Market,
    from: Date,
    to: Date,
  ): Promise<Candle[]> {
    return this.provider.getCandles(symbol, market, from, to);
  }

  private async recordSnapshot(quote: Quote): Promise<void> {
    await this.db.query(
      `INSERT INTO price_snapshot (symbol, market, price, source, captured_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        quote.symbol,
        quote.market,
        quote.price,
        this.provider.source,
        quote.capturedAt,
      ],
    );
    this.logger.debug(
      `snapshot ${quote.symbol}(${quote.market}) = ${quote.price} [${this.provider.source}]`,
    );
  }
}
