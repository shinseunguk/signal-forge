-- 001_init.sql — signal-forge 초기 스키마 (기획서 docs/PLAN.md §4)
-- 금액은 정밀도를 위해 NUMERIC 사용. symbol: KRX 6자리 코드(005930), US 티커(AAPL).

-- pgvector(vector) 확장은 임베딩 검색용 선택 항목이다.
-- 확장이 설치 가능한 환경(예: Docker의 pgvector/pgvector 이미지)에서만 활성화한다.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        CREATE EXTENSION IF NOT EXISTS vector;
    ELSE
        RAISE NOTICE 'pgvector(vector) 확장이 없어 signal.embedding 컬럼은 생성하지 않습니다.';
    END IF;
END
$$;

-- 4.1 포트폴리오 (가상 계좌)
CREATE TABLE IF NOT EXISTS portfolio (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    base_currency   TEXT NOT NULL DEFAULT 'KRW',
    initial_cash    NUMERIC(20,4) NOT NULL,      -- 초기 시드 (100,000,000)
    cash_balance    NUMERIC(20,4) NOT NULL,      -- 현재 현금 잔고
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.2 보유 포지션
CREATE TABLE IF NOT EXISTS position (
    id              BIGSERIAL PRIMARY KEY,
    portfolio_id    BIGINT NOT NULL REFERENCES portfolio(id),
    symbol          TEXT NOT NULL,
    market          TEXT NOT NULL,               -- 'KRX' | 'US'
    quantity        NUMERIC(20,6) NOT NULL DEFAULT 0,  -- 미국 소수점 대응
    avg_price       NUMERIC(20,4) NOT NULL DEFAULT 0,  -- 평균 매입가
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (portfolio_id, symbol)
);

-- 4.5 시그널 (LLM이 태깅한 구조화 데이터)
-- paper_order 가 signal 을 참조하므로 signal 을 먼저 생성한다.
CREATE TABLE IF NOT EXISTS signal (
    id              BIGSERIAL PRIMARY KEY,
    source          TEXT NOT NULL,               -- 'DART' | 'NEWS' | ...
    external_ref    TEXT,                        -- 원문 URL/공시번호
    raw_hash        TEXT UNIQUE,                 -- 원문 해시 (중복 수집 방지)
    symbol          TEXT NOT NULL,
    market          TEXT NOT NULL,
    sentiment_score NUMERIC(4,3) NOT NULL,       -- -1.000 ~ 1.000
    event_category  TEXT NOT NULL,               -- 'EARNINGS'|'REGULATION'|'MnA'|'GUIDANCE'|...
    confidence      NUMERIC(4,3) NOT NULL,       -- 0.000 ~ 1.000
    summary         TEXT,
    model           TEXT,                        -- 태깅에 쓴 모델명
    -- embedding vector(1536) 는 아래 DO 블록에서 pgvector 가용 시에만 추가
    published_at    TIMESTAMPTZ NOT NULL,        -- 원문 실제 발행 시각
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signal_symbol_pub ON signal(symbol, published_at DESC);

-- signal.embedding: pgvector 확장이 실제로 설치된 경우에만 컬럼 추가 (선택 항목)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        ALTER TABLE signal ADD COLUMN IF NOT EXISTS embedding vector(1536);
    END IF;
END
$$;

-- 4.3 페이퍼 주문 (실제 주문 아님 — 기록 전용)
CREATE TABLE IF NOT EXISTS paper_order (
    id              BIGSERIAL PRIMARY KEY,
    portfolio_id    BIGINT NOT NULL REFERENCES portfolio(id),
    symbol          TEXT NOT NULL,
    market          TEXT NOT NULL,
    side            TEXT NOT NULL,               -- 'BUY' | 'SELL'
    order_type      TEXT NOT NULL DEFAULT 'MARKET', -- 'MARKET' | 'LIMIT'
    quantity        NUMERIC(20,6) NOT NULL,
    fill_price      NUMERIC(20,4) NOT NULL,      -- 슬리피지 반영된 체결가
    gross_amount    NUMERIC(20,4) NOT NULL,      -- quantity * fill_price
    fee             NUMERIC(20,4) NOT NULL DEFAULT 0,  -- 수수료
    tax             NUMERIC(20,4) NOT NULL DEFAULT 0,  -- 매도세(SELL만)
    net_cash_flow   NUMERIC(20,4) NOT NULL,      -- 현금 변동 (BUY: 음수, SELL: 양수)
    signal_id       BIGINT REFERENCES signal(id),      -- 이 주문을 유발한 시그널 (nullable)
    idempotency_key TEXT UNIQUE,                 -- 중복 주문 방지 (예: buy-005930-20260721)
    note            TEXT,
    decided_at      TIMESTAMPTZ NOT NULL,        -- 전략이 결정 내린 시각
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.4 시세 스냅샷 (mark-to-market 및 성과 평가용)
CREATE TABLE IF NOT EXISTS price_snapshot (
    id              BIGSERIAL PRIMARY KEY,
    symbol          TEXT NOT NULL,
    market          TEXT NOT NULL,
    price           NUMERIC(20,4) NOT NULL,
    source          TEXT NOT NULL DEFAULT 'toss',
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_symbol_time ON price_snapshot(symbol, captured_at DESC);

-- 4.6 시그널 성과 (예측력 추적 — 핵심 피드백 루프)
CREATE TABLE IF NOT EXISTS signal_outcome (
    id              BIGSERIAL PRIMARY KEY,
    signal_id       BIGINT NOT NULL REFERENCES signal(id),
    horizon_days    INT NOT NULL,                -- 1, 5, 20
    price_at_signal NUMERIC(20,4) NOT NULL,
    price_after     NUMERIC(20,4),               -- horizon 경과 후 가격
    return_pct      NUMERIC(10,4),               -- (price_after/price_at_signal - 1) * 100
    evaluated_at    TIMESTAMPTZ,
    UNIQUE (signal_id, horizon_days)
);

-- 4.7 일일 NAV 스냅샷 (포트폴리오 가치 추이)
CREATE TABLE IF NOT EXISTS portfolio_snapshot (
    id              BIGSERIAL PRIMARY KEY,
    portfolio_id    BIGINT NOT NULL REFERENCES portfolio(id),
    total_value     NUMERIC(20,4) NOT NULL,      -- cash + 포지션 평가액
    cash_balance    NUMERIC(20,4) NOT NULL,
    positions_value NUMERIC(20,4) NOT NULL,
    return_pct      NUMERIC(10,4) NOT NULL,      -- 초기 시드 대비 누적 수익률
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (portfolio_id, captured_at)
);

-- 4.8 시장 캘린더 (휴장일 게이팅)
CREATE TABLE IF NOT EXISTS market_calendar (
    market          TEXT NOT NULL,
    session_date    DATE NOT NULL,
    is_open         BOOLEAN NOT NULL,
    PRIMARY KEY (market, session_date)
);
