import { Market } from '../market/market.types';

/**
 * 마찰비용 모델 (기획서 §6.2).
 * ⚠️ 실제 요율은 최신값 확인 후 확정할 것. 여기 값은 스펙 기준 placeholder.
 * 이 비용을 빼먹으면 수익률이 과대평가되어 검증이 무의미해진다(§1-3).
 */

/** 매매 수수료율. */
export const FEES: Record<Market, { commission: number }> = {
  US: { commission: 0.001 }, // 0.1%
};

/** 매도 시 추가 세금(증권거래세 등). ⚠️ 세율은 매년 변동 — 확인 후 설정. */
export const SELL_TAX: Record<Market, number> = {
  US: 0,
};

/** 시장가 체결 슬리피지. BUY 는 +, SELL 은 - 방향으로 적용. */
export const SLIPPAGE = 0.001; // 0.1%
