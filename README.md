# signal-forge

LLM이 뉴스·공시를 **구조화 시그널**로 태깅하고, 그 시그널의 **예측력을 가상 포트폴리오(페이퍼 트레이딩)로 검증**하는 시스템.

> ⚠️ **실제 돈이 오가지 않는 가상매매 시뮬레이터입니다.** 모든 매수·매도는 DB 상의 가상 거래이며, 실제 증권 계좌·자금은 절대 건드리지 않습니다. 증권사 API는 **읽기 전용 시세 조회에만** 사용합니다. 이 문서는 시스템 설계 스펙이며 투자 자문이 아닙니다.

전체 상세 기획은 [`docs/PLAN.md`](docs/PLAN.md), 작업 규칙은 [`CLAUDE.md`](CLAUDE.md) 참고.

---

## 절대 원칙

1. **실제 주문 API를 코드에 포함하지 않는다.** 시세/캔들 조회(읽기 전용)만 사용. "매수/매도"는 전부 `paper_order` 레코드 + 가상 포트폴리오 갱신으로만 구현.
2. **LLM은 판단하지 않고 태깅만 한다.** 매매 결정은 결정론적 규칙 엔진(`StrategyService`)이 내린다.
3. **마찰비용(수수료·세금·슬리피지)을 항상 반영한다.**
4. **모든 시그널·주문은 시점(`published_at`)을 기록한다.** (look-ahead bias 방지)

---

## 아키텍처

```
스케줄러(cron, ET 기준)
  ├─ 수집+LLM태깅 → Signals
  ├─ 전략→주문   → Strategy
  ├─ NAV 스냅샷  → Portfolio
  └─ 성과평가    → Performance
                    │
   Market(시세, 읽기전용) · Fx(환율) · Risk(게이트) · Execution(페이퍼주문)
                    │
              PostgreSQL
```

의존 방향: `Strategy → (Signals, Market, Portfolio, Risk, Execution)` · `Performance → (Portfolio, Market, Fx)`

---

## 주요 기능

| 영역 | 내용 |
|---|---|
| 시세 (Market) | 읽기 전용 현재가/캔들. Mock 기본, 토스 실 API 스켈레톤. `price_snapshot` 기록 |
| 포트폴리오 (Portfolio) | 밸류에이션(총평가액·누적수익률), 일일 NAV 스냅샷 |
| 페이퍼 실행 (Execution) | 슬리피지·수수료·세금 반영, 단일 트랜잭션, 멱등성(`idempotency_key`) |
| 리스크 게이트 (Risk) | 일일 손실 한도·종목 비중 상한·예수금·**휴장일·세션(본장)** |
| 시그널 (Signals) | DART/뉴스 수집 → LLM 태깅(temperature=0, JSON 강제) → `signal` 저장, `raw_hash` 중복 제거 |
| 전략 (Strategy) | 결정론적 규칙 엔진 v1(악재 필터 + 적립 매수) → 리스크 게이트 → 페이퍼 실행 |
| 성과 (Performance) ★ | 수익률·MDD·마찰비용, **시그널 예측력**(horizon 1/5/20일), 카테고리·감성별 효능 리포트 |
| 환율/환차익 (Fx) | USD 네이티브 계좌(1억 KRW→USD 펀딩), 리포트에 KRW 환산·**환차익 분해** |
| 세션 (Session) | 프리/본장/애프터 판정(America/New_York, **서머타임 자동**), 본장만 매매 |
| 캘린더 (Calendar) | 휴장일 provider 추상화. Mock(평일 규칙) 기본, **Finnhub 실 API**(미국 공휴일 반영). 부팅 시 + 주 1회 `market_calendar` 동기화 |
| 스케줄러 | cron 6종(ET), 실패 시 알림 |
| 알림 | **Discord**(기본)/Slack 웹훅, 일일 다이제스트(수익률·수익금액·매매일지·예측력) |
| 대시보드 | `GET /portfolio/:id/report` · `/portfolio/:id/journal` · `/signals/efficacy` |

---

## 기술 스택

Node.js 20+ · NestJS 11 · TypeScript(strict) · PostgreSQL 15+ (pgvector 선택) · `pg` Pool · `@nestjs/schedule` · Docker

---

## 빠른 시작

### Docker (권장)

`pgvector/pgvector:pg16` DB + 앱을 함께 구동하며, 부팅 시 마이그레이션·시드가 자동 실행됩니다.

```bash
cp .env.example .env   # 필요 값 채우기 (DISCORD_WEBHOOK_URL 등)
docker compose up --build
```

### 로컬 (PostgreSQL 직접)

```bash
npm install
cp .env.example .env            # DATABASE_URL 을 로컬 DB 로 수정
npm run migrate                 # 스키마 생성 (DB 없으면 자동 생성)
npm run seed                    # 초기 포트폴리오 (기본: 1억 KRW → USD 환전 계좌)
npm run seed:calendar           # 휴장일 캘린더 초기 시드(선택; 앱 부팅 시 provider 로 자동 동기화됨)
npm run start:dev
```

### 스크립트

| 명령 | 설명 |
|---|---|
| `npm run build` | 앱 + 스크립트 컴파일 |
| `npm test` | 단위 테스트 |
| `npm run migrate` / `:prod` | 마이그레이션 실행 |
| `npm run seed` / `:prod` | 포트폴리오 시드 |
| `npm run seed:calendar` / `:prod` | 시장 캘린더 시드 |
| `npm run start:dev` | 개발 서버 |

---

## 환경변수 (발췌)

```
DATABASE_URL=postgres://...
PORTFOLIO_BASE_CURRENCY=USD          # USD(미국 전용) | KRW
PORTFOLIO_FUNDING_KRW=100000000      # USD 계좌 펀딩 원금
FUNDING_FX_RATE=1350                 # 펀딩 환율(KRW per USD)
MARKET_PROVIDER=mock                 # mock | toss
FX_PROVIDER=mock                     # mock | exchangerate
SIGNAL_TAGGER=mock                   # mock | claude
CALENDAR_PROVIDER=mock               # mock(평일 규칙) | finnhub(실 공휴일)
FINNHUB_API_KEY=                     # finnhub 선택 시 필요(없으면 mock 폴백)
NOTIFIER=discord                     # discord | slack
DISCORD_WEBHOOK_URL=...
TRADE_SESSIONS_US=REGULAR            # REGULAR[,PRE,AFTER]
DAILY_LOSS_LIMIT_PCT=3
MAX_POSITION_WEIGHT_PCT=20
```

전체 목록은 [`.env.example`](.env.example) 참고.

---

## 일일 다이제스트 예시 (Discord)

```
📊 [signal-forge] 2026-07-22 일일 리포트 — signal-forge-main
💰 총평가액: 74,090.22 USD (수익 +16.15 USD, +0.022%)
💱 KRW 환산: 100,219,617원 (+0.22%) · 환율 1350→1352.67
   └ 주가손익 +21,796원 + 환차익 +197,821원
📉 MDD 0% · 마찰비용 누적 3 USD · 주문 3건(매수 3/매도 0)
📝 오늘 매매 (3건)
• 매수 AAPL 3.87주 @257.95 USD (비용 1 USD)
...
```

---

## 실전 연동 전환 (설정만)

| 대상 | 방법 |
|---|---|
| 실 시세 | 토스 스펙 확정 → `TossQuoteProvider` 구현 + `MARKET_PROVIDER=toss` |
| 실 LLM | `ClaudeLlmTagger` 구현 + `SIGNAL_TAGGER=claude` |
| 실 환율 | `ExchangeRateFxProvider` 구현 + `FX_PROVIDER=exchangerate` |
| 실 휴장일 | Finnhub API 키 발급 → `CALENDAR_PROVIDER=finnhub` + `FINNHUB_API_KEY=...` |
| 알림 | `DISCORD_WEBHOOK_URL` 설정 |

> 🔒 실제 주문 API 연동은 이 프로젝트의 스코프 밖(명시적 금지). 코드 전체에서 주문 엔드포인트 호출은 **0건**입니다.
