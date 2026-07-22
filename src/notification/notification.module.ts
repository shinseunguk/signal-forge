import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NOTIFIER } from './notifier.interface';
import { DiscordNotifier } from './discord-notifier';
import { SlackNotifier } from './slack-notifier';

/**
 * 알림 모듈. NOTIFIER(default discord)로 채널을 선택해 전역 제공한다.
 */
@Global()
@Module({
  providers: [
    DiscordNotifier,
    SlackNotifier,
    {
      provide: NOTIFIER,
      inject: [ConfigService, DiscordNotifier, SlackNotifier],
      useFactory: (
        config: ConfigService,
        discord: DiscordNotifier,
        slack: SlackNotifier,
      ) => {
        const channel = config.get<string>('notification.channel') ?? 'discord';
        return channel === 'slack' ? slack : discord;
      },
    },
  ],
  exports: [NOTIFIER],
})
export class NotificationModule {}
