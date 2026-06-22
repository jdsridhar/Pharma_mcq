import { Module } from '@nestjs/common';
import { LogChannelAdapter } from './adapters/log-channel.adapter';
import { NotificationMailer } from './adapters/notification-mailer';
import { NotificationController } from './notification.controller';
import { NotificationProcessor } from './notification.processor';
import { NotificationProducer } from './notification.producer';
import { NotificationService } from './notification.service';
import { CHANNEL_REGISTRY, type ChannelRegistry } from './ports/notification-channel.port';
import { NotificationRepository } from './repositories/notification.repository';

/**
 * Notification domain — persisted in-app feed + channel delivery (email/SMS/push/WhatsApp)
 * via a BullMQ worker. Channels are dev Log adapters (swap for SMTP/Twilio/FCM by re-keying
 * the registry). `NotificationMailer` is exported so Identity routes auth emails through here.
 */
@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    NotificationProducer,
    NotificationProcessor,
    NotificationMailer,
    {
      provide: CHANNEL_REGISTRY,
      useFactory: (): ChannelRegistry =>
        new Map([
          ['EMAIL', new LogChannelAdapter('EMAIL')],
          ['SMS', new LogChannelAdapter('SMS')],
          ['PUSH', new LogChannelAdapter('PUSH')],
          ['WHATSAPP', new LogChannelAdapter('WHATSAPP')],
        ]),
    },
  ],
  exports: [NotificationService, NotificationMailer],
})
export class NotificationModule {}
