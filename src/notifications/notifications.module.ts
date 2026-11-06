import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationRetentionService } from './notification-retention.service';
import { NotificationsController } from './notifications.controller';
import { PushDispatcherService } from './push/push-dispatcher.service';
import { PushSender } from './push/push-sender';
import { PushSubscriptionsService } from './push/push-subscriptions.service';
import { NotificationsScheduler } from './notifications.scheduler';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders/reminders.service';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    RemindersService,
    NotificationRetentionService,
    NotificationsScheduler,
    PushSender,
    PushDispatcherService,
    PushSubscriptionsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
