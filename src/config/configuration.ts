/**
 * 애플리케이션 설정을 네임스페이스로 구조화한다.
 * 원시 환경변수는 ConfigService 로도 접근 가능하지만,
 * 도메인 값은 아래 구조를 통해 접근하는 것을 권장한다.
 */
export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  market: {
    // 시세 제공자 선택: 'mock'(기본) | 'toss'(실 API, 스펙 확정 후)
    provider: process.env.MARKET_PROVIDER ?? 'mock',
  },
  fx: {
    // 환율 제공자: 'mock'(기본) | 'exchangerate'(실 API, 확정 후)
    provider: process.env.FX_PROVIDER ?? 'mock',
  },
  calendar: {
    // 휴장일 제공자: 'mock'(기본, 평일 규칙) | 'finnhub'(실 API, 공휴일 반영)
    provider: process.env.CALENDAR_PROVIDER ?? 'mock',
    // finnhub provider 사용 시 필요. 없으면 mock 으로 폴백한다.
    finnhubApiKey: process.env.FINNHUB_API_KEY ?? '',
    finnhubBaseUrl: process.env.FINNHUB_API_BASE ?? 'https://finnhub.io/api/v1',
  },
  signals: {
    // LLM 태거 선택: 'mock'(기본) | 'claude'(실 API, 키·프롬프트 확정 후)
    tagger: process.env.SIGNAL_TAGGER ?? 'mock',
  },
  scheduler: {
    // false 면 cron 잡 본문을 건너뛴다.
    enabled: (process.env.SCHEDULER_ENABLED ?? 'true') !== 'false',
  },
  notification: {
    // 알림 채널: 'discord'(기본) | 'slack'
    channel: process.env.NOTIFIER ?? 'discord',
  },
  portfolio: {
    initialCash: Number(process.env.PORTFOLIO_INITIAL_CASH ?? 100_000_000),
    name: process.env.PORTFOLIO_NAME ?? 'signal-forge-main',
  },
  risk: {
    dailyLossLimitPct: Number(process.env.DAILY_LOSS_LIMIT_PCT ?? 3),
    maxPositionWeightPct: Number(process.env.MAX_POSITION_WEIGHT_PCT ?? 20),
  },
});
