# 페이퍼 트레이딩 검증 시스템 — 개발 기획서

> ## ⚠️ 이 시스템의 본질 (가장 먼저 읽을 것)
> 이 시스템은 실제 돈이 오가지 않는 **가상매매(페이퍼 트레이딩) 시뮬레이터**다.
> 모든 매수·매도는 **DB 상의 가상 거래**이며, 실제 증권 계좌·실제 자금은 절대 건드리지 않는다.
> 이 시스템의 유일한 목적은 **전략/시그널이 실제로 수익을 냈는지 수익률로 검증**하는 것이다.
> 실제 주문 API(매수/매도/정정/취소)는 코드에 포함하지 않으며, 토스증권 API는 **읽기 전용 시세 조회에만** 사용한다.

> **이 문서의 목적**: Claude Code가 이 문서 하나만 읽고 전체 시스템을 순서대로 구현할 수 있도록 작성한 실행 가능한 스펙입니다.
> 각 Phase를 위에서 아래로 순서대로 구현하세요. Phase 간 의존성이 있으므로 순서를 지켜야 합니다.

---

## 0. 프로젝트 한 줄 정의

LLM이 뉴스·공시를 구조화 시그널로 태깅하고, 그 시그널의 **예측력을 가상 포트폴리오(초기 시드 1억원)로 검증**하는 페이퍼 트레이딩 시스템. **실제 주문은 하지 않는다.**

---

## 1. 절대 원칙 (Non-negotiable)

이 원칙들은 구현 전체에서 반드시 지켜야 하며, 위반 시 시스템의 존재 의의가 사라진다.

1. **실제 주문 API를 코드에 포함하지 않는다.**
   - 토스증권 API에서 사용하는 엔드포인트는 **읽기 전용 시세/캔들 조회뿐**이다.
   - 주문 생성/정정/취소 엔드포인트(`POST .../order` 등)는 **import조차 하지 않는다.**
   - "매수/매도"는 전부 DB 안 `paper_order` 레코드 생성 + 가상 포트폴리오 갱신으로만 구현한다.
   - 결과적으로 이 시스템은 버그가 나도 실계좌를 건드릴 물리적 경로가 없어야 한다.

2. **LLM은 판단하지 않고 태깅만 한다.**
   - LLM의 출력은 `{symbol, sentiment_score, event_category, confidence, summary}` 같은 구조화 데이터뿐이다.
   - "사라/팔아라" 결정은 LLM이 아니라 결정론적 규칙 엔진(`StrategyService`)이 내린다.
   - 재현성을 위해 LLM 호출은 `temperature=0`, 프롬프트 고정.

3. **마찰비용을 항상 반영한다.**
   - 모든 페이퍼 주문에 수수료·세금·슬리피지를 계산해서 반영한다. (§6.2)
   - 이걸 빼먹으면 수익률이 과대평가되어 검증 자체가 무의미해진다.

4. **모든 시그널·주문은 "시점"을 기록한다.**
   - 시그널은 반드시 `published_at`(기사/공시 실제 발행 시각)을 기준으로 저장한다.
   - Look-ahead bias(미래 정보 누출) 방지. 성과 평가 시 "그 시점에 실제로 존재했던 정보"만 사용.

---

## 2. 기술 스택

| 항목 | 선택 | 비고 |
|---|---|---|
| 런타임 | Node.js 20+ | |
| 프레임워크 | NestJS 10+ | |
| 언어 | TypeScript (strict) | |
| DB | PostgreSQL 15+ | `pgvector` 확장 (시그널 임베딩용, 선택) |
| DB 접근 | TypeORM 또는 `pg` Pool | 아래 스키마는 ORM 무관 raw DDL로 제공 |
| 스케줄러 | `@nestjs/schedule` | cron 작업 |
| HTTP | `axios` (`@nestjs/axios`) | 토스 시세 조회 |
| 설정 | `@nestjs/config` | 환경변수 |
| 검증 | `class-validator`, `class-transformer` | DTO |
| 로깅 | NestJS Logger + Slack Webhook | 알림 |
| 컨테이너 | Docker / Docker Compose | **서비스 구동은 Docker로 한다** (아래 §실행 환경 참고) |

### 실행 환경 (Docker)

서비스(앱·DB)는 **Docker로 구동**한다. 로컬 개발·운영 모두 `docker compose`를 기준으로 한다.

- **`docker-compose.yml`** 구성:
  - `app`: NestJS 애플리케이션 컨테이너 (멀티스테이지 `Dockerfile`로 빌드).
  - `db`: PostgreSQL 컨테이너. 이미지는 **`pgvector/pgvector:pg16`**을 사용해 `vector` 확장을 기본 제공한다(임베딩 검색 활성화). 데이터는 named volume으로 영속화.
- 환경변수는 `.env`(§8)로 주입. 앱 컨테이너의 `DATABASE_URL` 호스트는 컴포즈 서비스명(`db`)을 사용한다. 예: `postgres://sf:sf@db:5432/signal_forge`.
- 마이그레이션/시드는 앱 컨테이너에서 npm 스크립트로 실행한다. 예: `docker compose run --rm app npm run migrate` / `... npm run seed`.
- 로컬에 Postgres가 이미 있어 Docker 없이 개발할 경우, pgvector 미설치 환경일 수 있으므로 마이그레이션은 `vector` 확장을 **가용할 때만** 임베딩 컬럼을 생성하도록 방어적으로 작성한다(기획서 §4의 임베딩은 선택 항목).

---

## 3. 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    스케줄러 (cron)                        │
│  - 뉴스/공시 수집 (5분)                                    │
│  - 전략 평가 & 페이퍼 주문 (장중 N분)                      │
│  - 일일 NAV 스냅샷 (장 마감 후)                            │
│  - 시그널 성과 평가 (매일 새벽)                            │
└───────────────────────┬─────────────────────────────────┘
                        │
   ┌────────────┬───────┴────────┬──────────────┬───────────┐
   ▼            ▼                ▼              ▼           ▼
┌────────┐ ┌─────────┐   ┌────────────┐  ┌──────────┐ ┌──────────┐
│Signals │ │ Market  │   │  Strategy  │  │Execution │ │Performance│
│(수집+  │ │(시세    │   │ (결정론적  │  │(페이퍼   │ │(수익률·   │
│ LLM태깅)│ │ 조회,   │   │  규칙엔진) │  │ 주문기록)│ │ 예측력)   │
│        │ │ 읽기전용)│   │            │  │          │ │           │
└───┬────┘ └────┬────┘   └─────┬──────┘  └────┬─────┘ └────┬─────┘
    │           │              │              │            │
    └───────────┴──────────────┴──────────────┴────────────┘
                              │
                      ┌───────▼────────┐
                      │  PostgreSQL    │
                      └────────────────┘
```

모듈 의존 방향: `Strategy` → (`Signals`, `Market`, `Portfolio`) / `Execution` → (`Portfolio`, `Market`) / `Performance` → (`Signals`, `Market`, `Portfolio`)

---

## 4. 데이터베이스 스키마

> Phase 1에서 이 DDL을 `migrations/001_init.sql`로 그대로 생성하세요.
> 금액은 정밀도 문제로 `NUMERIC` 사용. `symbol`은 KRX는 6자리 코드(`005930`), 미국은 티커(`AAPL`).

```sql
-- 확장 (임베딩 검색용, 선택)
CREATE EXTENSION IF NOT EXISTS vector;

-- 4.1 포트폴리오 (가상 계좌)
CREATE TABLE portfolio (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    base_currency   TEXT NOT NULL DEFAULT 'KRW',
    initial_cash    NUMERIC(20,4) NOT NULL,      -- 초기 시드 (100,000,000)
    cash_balance    NUMERIC(20,4) NOT NULL,      -- 현재 현금 잔고
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.2 보유 포지션
CREATE TABLE position (
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

-- 4.3 페이퍼 주문 (실제 주문 아님 — 기록 전용)
CREATE TABLE paper_order (
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
    signal_id       BIGINT REFERENCES signal(id),-- 이 주문을 유발한 시그널 (nullable)
    idempotency_key TEXT UNIQUE,                 -- 중복 주문 방지 (예: buy-005930-20260721)
    note            TEXT,
    decided_at      TIMESTAMPTZ NOT NULL,        -- 전략이 결정 내린 시각
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.4 시세 스냅샷 (mark-to-market 및 성과 평가용)
CREATE TABLE price_snapshot (
    id              BIGSERIAL PRIMARY KEY,
    symbol          TEXT NOT NULL,
    market          TEXT NOT NULL,
    price           NUMERIC(20,4) NOT NULL,
    source          TEXT NOT NULL DEFAULT 'toss',
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_price_symbol_time ON price_snapshot(symbol, captured_at DESC);

-- 4.5 시그널 (LLM이 태깅한 구조화 데이터)
CREATE TABLE signal (
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
    embedding       vector(1536),                -- 선택 (유사 시그널 검색)
    published_at    TIMESTAMPTZ NOT NULL,        -- ★ 원문 실제 발행 시각
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_signal_symbol_pub ON signal(symbol, published_at DESC);

-- 4.6 시그널 성과 (예측력 추적 — 핵심 피드백 루프)
CREATE TABLE signal_outcome (
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
CREATE TABLE portfolio_snapshot (
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
CREATE TABLE market_calendar (
    market          TEXT NOT NULL,
    session_date    DATE NOT NULL,
    is_open         BOOLEAN NOT NULL,
    PRIMARY KEY (market, session_date)
);
```

> **주의**: `paper_order.signal_id`와 `signal` 테이블은 순환 참조처럼 보이나, `signal`을 먼저 생성한 뒤 `paper_order`를 생성하면 됩니다. 마이그레이션에서 `signal` → `paper_order` 순서로 정의하세요.

---

## 5. 모듈 & 기능 명세

각 모듈은 NestJS 모듈로 구성한다. 아래 메서드 시그니처를 그대로 구현하세요.

### 5.1 `DbModule` / `MarketModule` — 시세 조회 (읽기 전용)

토스증권 Open API에서 **시세/캔들 조회만** 수행. 주문 관련 코드 절대 포함 금지.

```typescript
// market/toss-quote.service.ts
interface Quote { symbol: string; market: 'KRX' | 'US'; price: number; capturedAt: Date; }

class TossQuoteService {
  // OAuth 2.0 Client Credentials로 액세스 토큰 발급 + 캐싱(만료 전 재사용)
  private getAccessToken(): Promise<string>;

  // GET /api/v1/prices — 현재가 조회 (토큰만 필요, 읽기 전용)
  getPrice(symbol: string, market: 'KRX' | 'US'): Promise<Quote>;

  // GET /api/v1/candles — 캔들 조회 (성과 평가용 과거 가격)
  getCandles(symbol: string, market: 'KRX' | 'US', from: Date, to: Date): Promise<Candle[]>;

  // 조회할 때마다 price_snapshot 테이블에 기록
}
```

> ⚠️ 토스 Open API는 롤아웃 단계라 엔드포인트/파라미터 정확한 스펙은 `developers.tossinvest.com` 문서로 최종 확인 후 확정할 것. Base URL: `https://openapi.tossinvest.com`. 인증은 App Key/Secret → OAuth 2.0 토큰.

### 5.2 `PortfolioModule` — 가상 포트폴리오 & 밸류에이션

```typescript
class PortfolioService {
  // 초기 시드로 포트폴리오 생성 (name, initialCash=100_000_000)
  create(name: string, initialCash: number): Promise<Portfolio>;

  // 현재 포트폴리오 총 평가액 = cash_balance + Σ(position.qty * 현재가)
  //  - 각 포지션 현재가는 TossQuoteService.getPrice로 조회
  valuate(portfolioId: number): Promise<{
    totalValue: number; cashBalance: number; positionsValue: number; returnPct: number;
  }>;

  // 일일 NAV 스냅샷 저장 (portfolio_snapshot insert)
  snapshot(portfolioId: number): Promise<void>;

  getPositions(portfolioId: number): Promise<Position[]>;
}
```

### 5.3 `ExecutionModule` — 페이퍼 주문 실행 (기록 전용)

**여기가 "매매"를 구현하는 곳이지만, 실제 API 호출은 없다.** DB 트랜잭션으로 현금·포지션만 갱신한다.

```typescript
class PaperExecutionService {
  // 페이퍼 매수: 현재가 조회 → 슬리피지 적용 → 수수료 계산 → 현금 차감 → 포지션 증가
  //  - 예수금 부족 시 거부 + 로깅
  //  - idempotencyKey 중복 시 무시 (같은 날 중복 주문 방지)
  //  - 전 과정을 단일 DB 트랜잭션으로
  paperBuy(input: {
    portfolioId: number; symbol: string; market: 'KRX' | 'US';
    quantity?: number; orderAmount?: number;  // 둘 중 하나 (orderAmount는 금액 기반)
    signalId?: number; idempotencyKey: string; decidedAt: Date; note?: string;
  }): Promise<PaperOrder>;

  // 페이퍼 매도: 보유 수량 확인 → 슬리피지 → 수수료+세금 → 현금 증가 → 포지션 감소
  paperSell(input: {
    portfolioId: number; symbol: string; market: 'KRX' | 'US';
    quantity: number; signalId?: number; idempotencyKey: string; decidedAt: Date; note?: string;
  }): Promise<PaperOrder>;
}
```

### 5.4 `SignalsModule` — 수집 + LLM 태깅

```typescript
class IngestionService {
  // DART 공시 / 뉴스 수집 → raw_hash로 중복 제거 → 원문 저장
  collectDart(): Promise<RawDoc[]>;   // 공시 API
  collectNews(): Promise<RawDoc[]>;   // 뉴스 소스
}

class TaggingService {
  // 원문 → LLM(temperature=0, 고정 프롬프트) → 구조화 시그널
  //  출력 스키마를 JSON으로 강제, 파싱 실패 시 재시도/스킵
  tag(doc: RawDoc): Promise<{
    symbol: string; market: 'KRX'|'US';
    sentimentScore: number;   // -1 ~ 1
    eventCategory: string;    // EARNINGS | REGULATION | MnA | GUIDANCE | LAWSUIT | OTHER
    confidence: number;       // 0 ~ 1
    summary: string;
  }>;
  // 결과를 signal 테이블에 published_at(원문 발행시각) 기준으로 저장
}
```

LLM 태깅 프롬프트 요구사항:
- 반드시 JSON만 출력 (마크다운 펜스 금지).
- 종목을 특정할 수 없으면 스킵(저장 안 함).
- `sentiment_score`는 주가 방향 예측이 아니라 **기사 논조**만 반영하도록 지시(예측은 규칙 엔진이 함).

### 5.5 `StrategyModule` — 결정론적 규칙 엔진

**돈을 벌지 잃을지를 결정하는 핵심. LLM 아님. 순수 규칙.**

```typescript
class StrategyService {
  // 현재 시그널 + 시세 + 포트폴리오 상태를 받아 액션 목록 산출
  evaluate(portfolioId: number): Promise<Array<{
    action: 'BUY' | 'SELL' | 'HOLD';
    symbol: string; market: 'KRX'|'US';
    quantity?: number; orderAmount?: number;
    reason: string; signalId?: number;
  }>>;
}
```

**MVP 규칙 (v1) — 리스크 필터 우선 접근**:
1. **악재 필터(방어)**: 최근 N시간 내 `sentiment_score < -0.5 && confidence > 0.6`인 종목은 신규 매수 금지 + 보유 시 매도 후보.
2. **적립 매수(공격, 단순)**: 사전 지정된 관심 종목 리스트에 대해 정규장 시간에 `orderAmount` 기반 분할 매수. 단, 위 악재 필터 통과 종목만.
3. **모든 액션은 리스크 게이트(§6.3)를 통과해야 실행.**

> 전략은 버전으로 관리(`v1`, `v2`...). 규칙을 코드 상수/설정으로 분리해 백테스트·튜닝 가능하게.

### 5.6 `PerformanceModule` — 수익률 & 시그널 예측력 분석 ★

이 프로젝트의 진짜 산출물. "봇이 돈을 벌었나" + "내 시그널이 실제로 예측력이 있었나"를 데이터로 답한다.

```typescript
class PerformanceService {
  // 포트폴리오 성과: 누적 수익률, 최대 낙폭(MDD), 승률, 마찰비용 총합
  portfolioReport(portfolioId: number): Promise<PortfolioReport>;

  // ★ 시그널 예측력: 각 시그널의 horizon(1/5/20일) 후 실제 수익률 계산
  //   → signal_outcome 저장. 카테고리별/감성구간별 상관관계 집계.
  //   "REGULATION 태그 종목의 5일 수익률이 실제로 낮았나?" 를 데이터로.
  evaluateSignals(horizonDays: number[]): Promise<void>;

  // 시그널 유형별 예측력 리포트 (어떤 태그가 먹히고 어떤 게 노이즈인지)
  signalEfficacyReport(): Promise<SignalEfficacyReport>;
}
```

---

## 6. 핵심 비즈니스 로직

### 6.1 밸류에이션
`총평가액 = cash_balance + Σ(position.quantity × 현재가)`
`누적수익률(%) = (총평가액 - initial_cash) / initial_cash × 100`

### 6.2 마찰비용 모델 (⚠️ 반드시 반영)

```typescript
// config로 분리. 실제 요율은 최신값 확인 후 확정할 것.
const FEES = {
  KRX: { commission: 0.00015 },   // 매매수수료 0.015% (KRX 체결 기준)
  US:  { commission: 0.001 },     // 0.1%, 체결금액 $10 이하는 무료 처리
};
// 매도 시 추가 세금 (⚠️ 증권거래세율은 매년 변동 — 현재 세율 반드시 확인 후 설정)
const SELL_TAX = { KRX: 0.0015 /* placeholder */, US: 0 };
// 슬리피지 시뮬레이션: 시장가 체결가에 방향성 슬리피지 적용
const SLIPPAGE = 0.001;  // 0.1% (BUY는 +, SELL은 -)
```

- 매수: `net_cash_flow = -(gross + fee)`, `fill_price = quote * (1 + SLIPPAGE)`
- 매도: `net_cash_flow = +(gross - fee - tax)`, `fill_price = quote * (1 - SLIPPAGE)`

### 6.3 리스크 게이트 (실행 전 필수 통과)
- 일일 손실 한도: 당일 누적 손실이 시드의 X% 도달 시 그날 신규 매수 전면 중단.
- 종목당 비중 상한: 단일 종목 평가액이 총자산의 Y% 초과 금지.
- 예수금 체크: 매수액 > cash_balance면 거부.
- 휴장일 게이팅: `market_calendar`에서 당일 개장 여부 확인, 휴장이면 스킵.
- 멱등성: `idempotency_key` 중복이면 무시.

### 6.4 시그널 성과 평가 로직
1. 평가 대상: `published_at`이 horizon일 이상 지난 시그널.
2. `price_at_signal` = 시그널 발행 시점 근처 종가(캔들 조회).
3. `price_after` = horizon일 후 종가.
4. `return_pct` 저장 → 카테고리·감성구간별 평균/상관 집계.

---

## 7. 스케줄러 (cron)

```typescript
// @nestjs/schedule
'*/5 9-15 * * 1-5'   → 뉴스/공시 수집 + LLM 태깅 (장중, 평일)
'*/10 9-15 * * 1-5'  → StrategyService.evaluate → 페이퍼 주문 (장중, 평일)
'40 15 * * 1-5'      → PortfolioService.snapshot (국내장 마감 후 NAV 기록)
'0 6 * * *'          → PerformanceService.evaluateSignals([1,5,20]) (매일 새벽)
```
- 미국장 대응 시 별도 타임존 cron 추가.
- 모든 스케줄 작업은 실패 시 Slack Webhook으로 알림.

---

## 8. 환경변수 (`.env`)

```
DATABASE_URL=postgres://...
TOSS_APP_KEY=...
TOSS_APP_SECRET=...
TOSS_API_BASE=https://openapi.tossinvest.com
LLM_API_KEY=...
LLM_MODEL=...
DART_API_KEY=...
SLACK_WEBHOOK_URL=...
PORTFOLIO_INITIAL_CASH=100000000
DAILY_LOSS_LIMIT_PCT=3
MAX_POSITION_WEIGHT_PCT=20
```

---

## 9. 구현 순서 (Claude Code 빌드 체크리스트)

> 위에서 아래로 순서대로. 각 Phase 끝에 동작 확인 후 다음으로.

- [ ] **Phase 1 — 기반**: NestJS 프로젝트 초기화, `ConfigModule`, DB 연결, `migrations/001_init.sql`(§4) 실행, 시드 스크립트로 1억원 포트폴리오 1개 생성. **Docker 구성(`Dockerfile`, `docker-compose.yml` — app + `pgvector/pgvector:pg16` db) 포함.**
- [ ] **Phase 2 — 시세**: `MarketModule` / `TossQuoteService`. `getPrice`, `getCandles`. 조회 시 `price_snapshot` 기록. **주문 코드 없음 확인.**
- [ ] **Phase 3 — 포트폴리오**: `PortfolioService.valuate` / `snapshot` / `getPositions`.
- [ ] **Phase 4 — 페이퍼 실행**: `PaperExecutionService.paperBuy` / `paperSell`. 마찰비용(§6.2) + 트랜잭션 + 멱등성. 단위 테스트로 현금/포지션 정합성 검증.
- [ ] **Phase 5 — 리스크 게이트**: §6.3 전부. 휴장일 캘린더 시드.
- [ ] **Phase 6 — 시그널**: `IngestionService`(DART/뉴스) + `TaggingService`(LLM 태깅, JSON 강제, temperature=0). 중복 제거.
- [ ] **Phase 7 — 전략**: `StrategyService.evaluate` v1 규칙(악재 필터 + 단순 적립). 리스크 게이트 연동.
- [ ] **Phase 8 — 스케줄러**: §7 cron 4종 + Slack 알림.
- [ ] **Phase 9 — 성과 분석 ★**: `PerformanceService`. NAV 추이, 시그널 예측력(`signal_outcome`), 카테고리별 효능 리포트.
- [ ] **Phase 10 — 대시보드(선택)**: 수익률·시그널 효능 조회 REST 엔드포인트 (`GET /portfolio/:id/report`, `GET /signals/efficacy`).

---

## 10. 검증 기준 (Definition of Done)

시스템이 "완성"되었다고 볼 수 있는 조건:
1. 코드 전체에서 토스 주문 엔드포인트 호출이 **0건**이다. (grep으로 확인 가능해야 함)
2. 페이퍼 매수/매도가 현금·포지션·마찰비용을 정확히 반영한다(단위 테스트 통과).
3. 며칠 돌린 뒤 `portfolio_snapshot`에 NAV 추이가 쌓이고, 초기 시드(1억원) 대비 누적 수익률이 계산된다.
4. `signal_outcome`가 채워지고, "어떤 시그널 유형이 실제로 예측력이 있었는지" 리포트가 나온다.

---

## 11. 스코프 밖 (하지 말 것)

- 실제 주문(매수/매도) API 연동 — **명시적으로 금지.**
- 실시간 WebSocket 피드 (토스 미공개, 폴링으로 충분).
- 레버리지·파생·공매도 시뮬레이션 (MVP 범위 밖).
- "종목 추천"을 LLM에게 직접 시키는 로직 (원칙 §1-2 위반).

---

## 부록. 주의 (개발자 메모)

이 시스템은 **전략의 예측력을 리스크 0으로 검증하는 도구**이지, 수익을 보장하는 봇이 아니다. 페이퍼 수익률이 좋아도 실전에서는 슬리피지·체결지연·유동성 때문에 달라진다. 실제 자금 투입은 이 시스템으로 충분한 기간 검증한 뒤, 스스로 판단·감당 가능한 범위에서만 결정할 것. 이 문서는 시스템 설계 스펙이며 투자 자문이 아니다.
