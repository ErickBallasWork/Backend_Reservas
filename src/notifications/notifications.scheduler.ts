import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { AppConfigService } from '../config/app-config.service';
import { NotificationRetentionService } from './notification-retention.service';
import { RemindersService } from './reminders/reminders.service';

const REMINDER_INTERVAL_MS = 60_000;

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);
  private reminding = false;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly reminders: RemindersService,
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
