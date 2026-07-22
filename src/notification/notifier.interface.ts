/** Notifier 구현체 주입 토큰. */
export const NOTIFIER = 'NOTIFIER';

/**
 * 알림 채널 추상화. 현재 구현: Discord(기본) / Slack.
 * 향후 Telegram·FCM 등은 이 인터페이스만 구현해 교체한다.
 */
export interface Notifier {
  readonly channel: string;
  /** 일반 메시지 전송. */
  send(text: string): Promise<void>;
  /** 스케줄 잡 실패 알림. */
  notifyFailure(job: string, error: unknown): Promise<void>;
}
