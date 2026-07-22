import { Injectable } from '@nestjs/common';
import { Market } from './market.types';

export type MarketSession = 'PRE' | 'REGULAR' | 'AFTER' | 'CLOSED';

interface SessionWindow {
  tz: string;
  /** 분 단위 [시작, 끝). 없으면 해당 세션 미운영. */
  pre?: [number, number];
  regular: [number, number];
  after?: [number, number];
}

const H = (h: number, m = 0) => h * 60 + m;

/**
 * 거래소별 세션 시각(현지 시간 분 단위).
 * ⚠️ 반드시 거래소 타임존으로 계산한다 → 서머타임(EDT/EST) 자동 처리.
 */
const WINDOWS: Record<Market, SessionWindow> = {
  US: {
    tz: 'America/New_York',
    pre: [H(4), H(9, 30)], // 04:00–09:30
    regular: [H(9, 30), H(16)], // 09:30–16:00 (본장)
    after: [H(16), H(20)], // 16:00–20:00
  },
  KRX: {
    tz: 'Asia/Seoul',
    regular: [H(9), H(15, 30)], // 09:00–15:30
  },
};

/** 각 시장에서 매매를 허용할 세션(기본 본장만). 필요 시 env 로 확장. */
export const ALLOWED_SESSIONS: Record<Market, MarketSession[]> = {
  US: parseSessions(process.env.TRADE_SESSIONS_US) ?? ['REGULAR'],
  KRX: parseSessions(process.env.TRADE_SESSIONS_KRX) ?? ['REGULAR'],
};

function parseSessions(raw?: string): MarketSession[] | null {
  if (!raw) return null;
  const valid: MarketSession[] = ['PRE', 'REGULAR', 'AFTER'];
  const list = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is MarketSession => (valid as string[]).includes(s));
  return list.length > 0 ? list : null;
}

/**
 * 시장 세션 판정. 거래소 현지 시각(요일·분)을 Intl 로 구해 DST 를 자동 반영한다.
 */
@Injectable()
export class MarketSessionService {
  getSession(market: Market, at: Date = new Date()): MarketSession {
    const window = WINDOWS[market];
    const { weekday, minutes } = this.localParts(at, window.tz);
    if (weekday === 'Sat' || weekday === 'Sun') return 'CLOSED';

    if (this.inRange(minutes, window.pre)) return 'PRE';
    if (this.inRange(minutes, window.regular)) return 'REGULAR';
    if (this.inRange(minutes, window.after)) return 'AFTER';
    return 'CLOSED';
  }

  private inRange(minutes: number, range?: [number, number]): boolean {
    return !!range && minutes >= range[0] && minutes < range[1];
  }

  /** 지정 타임존의 요일(3글자)과 자정 이후 경과 분. */
  private localParts(at: Date, tz: string): { weekday: string; minutes: number } {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = fmt.formatToParts(at);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const weekday = pick('weekday');
    const hour = parseInt(pick('hour'), 10);
    const minute = parseInt(pick('minute'), 10);
    return { weekday, minutes: hour * 60 + minute };
  }
}
