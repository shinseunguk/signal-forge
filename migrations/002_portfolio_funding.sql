-- 002_portfolio_funding.sql — USD 네이티브 계좌의 펀딩(환전) 정보 (Phase 11)
-- base_currency 와 별개로, "무엇으로 얼마를 어떤 환율에 넣었는지"를 기록해
-- KRW 환산·환차익 리포트를 가능하게 한다.

ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS funded_amount   NUMERIC(20,4);   -- 원 통화 펀딩 금액 (예: 100,000,000 KRW)
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS funded_currency TEXT;            -- 펀딩 통화 (예: 'KRW')
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS initial_fx_rate NUMERIC(20,6);   -- 펀딩 시점 환율 (funded_currency per base_currency, 예: KRW per USD)
