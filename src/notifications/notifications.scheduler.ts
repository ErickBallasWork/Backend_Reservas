import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { AppConfigService } from '../config/app-config.service';
import { NotificationRetentionService } from './notification-retention.service';
import { PushDispatcherService } from './push/push-dispatcher.service';
import { RemindersService } from './reminders/reminders.service';

const REMINDER_INTERVAL_MS = 60_000;
const PUSH_INTERVAL_MS = 10_000;

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);
  private reminding = false;
  private dispatching = false;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly reminders: RemindersService,
    private readonly pushDispatcher: PushDispatcherService,
    private readonly retention: NotificationRetentionService,
  ) {}

  @Interval(REMINDER_INTERVAL_MS)
  async sendReminders(): Promise<void> {
    if (!this.appConfig.jobs.schedulerEnabled || this.reminding) return;
    this.reminding = true;
    try {
      await this.reminders.sendDue();
    } catch (error) {
      this.logger.error(`Reminder run failed: ${String(error)}`);
    } finally {
      this.reminding = false;
    }
  }

  @Interval(PUSH_INTERVAL_MS)
  async dispatchPush(): Promise<void> {
    if (!this.appConfig.jobs.schedulerEnabled || this.dispatching) return;
    this.dispatching = true;
    try {
      await this.pushDispatcher.dispatchPending();
    } catch (error) {
      this.logger.error(`Push dispatch failed: ${String(error)}`);
    } finally {
      this.dispatching = false;
    }
  }

  @Cron('0 3 * * *')
  async purgeOldNotifications(): Promise<void> {
    if (!this.appConfig.jobs.schedulerEnabled) return;
    try {
      await this.retention.purge();
    } catch (error) {
      this.logger.error(`Notification purge failed: ${String(error)}`);
    }
  }
}
