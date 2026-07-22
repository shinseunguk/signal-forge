import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notifier } from './notifier.interface';

/**
 * Slack Incoming Webhook 알림 (선택지). SLACK_WEBHOOK_URL 미설정 시 로그만 남긴다.
 */
@Injectable()
export class SlackNotifier implements Notifier {
  readonly channel = 'slack';
  private readonly logger = new Logger(SlackNotifier.name);
  private readonly webhookUrl?: string;

  constructor(config: ConfigService) {
    this.webhookUrl = config.get<string>('SLACK_WEBHOOK_URL') || undefined;
  }

  async notifyFailure(job: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.send(`:rotating_light: [signal-forge] 스케줄 잡 실패: *${job}*\n${message}`);
  }

  async send(text: string): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.warn(`SLACK_WEBHOOK_URL 미설정 → 알림 생략: ${text}`);
      return;
    }
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch (error) {
      this.logger.error(`Slack 알림 전송 실패: ${error}`);
    }
  }
}
