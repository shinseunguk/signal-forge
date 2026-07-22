import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notifier } from './notifier.interface';

const DISCORD_MAX = 1900; // content 2000자 제한 여유

/**
 * Discord Incoming Webhook 알림. DISCORD_WEBHOOK_URL 미설정 시 로그만 남긴다.
 * 알림 실패가 호출부를 실패시키지 않도록 예외를 내부에서 흡수한다.
 */
@Injectable()
export class DiscordNotifier implements Notifier {
  readonly channel = 'discord';
  private readonly logger = new Logger(DiscordNotifier.name);
  private readonly webhookUrl?: string;

  constructor(config: ConfigService) {
    this.webhookUrl = config.get<string>('DISCORD_WEBHOOK_URL') || undefined;
  }

  async notifyFailure(job: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.send(`🚨 **[signal-forge] 스케줄 잡 실패: ${job}**\n${message}`);
  }

  async send(text: string): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.warn(`DISCORD_WEBHOOK_URL 미설정 → 알림 생략:\n${text}`);
      return;
    }
    const content = text.length > DISCORD_MAX ? text.slice(0, DISCORD_MAX) + '…' : text;
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      this.logger.error(`Discord 알림 전송 실패: ${error}`);
    }
  }
}
