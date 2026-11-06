import { type AppConfigService } from '../config/app-config.service';
import { type NotificationRetentionService } from './notification-retention.service';
import { NotificationsScheduler } from './notifications.scheduler';
import { type PushDispatcherService } from './push/push-dispatcher.service';
import { type RemindersService } from './reminders/reminders.service';

function build(schedulerEnabled = true) {
  const reminders = { sendDue: jest.fn().mockResolvedValue({ reminded: 0 }) };
  const retention = { purge: jest.fn().mockResolvedValue({ purged: 0 }) };
  const pushDispatcher = { dispatchPending: jest.fn().mockResolvedValue({ sent: 0, failed: 0 }) };
  const scheduler = new NotificationsScheduler(
    { jobs: { schedulerEnabled } } as unknown as AppConfigService,
    reminders as unknown as RemindersService,
    pushDispatcher as unknown as PushDispatcherService,
    retention as unknown as NotificationRetentionService,
  );
  return { scheduler, reminders, retention, pushDispatcher };
}

describe('NotificationsScheduler', () => {
  it('runs the reminders and the purge when the scheduler is enabled', async () => {
    const { scheduler, reminders, retention } = build();

    await scheduler.sendReminders();
    await scheduler.purgeOldNotifications();

    expect(reminders.sendDue).toHaveBeenCalledTimes(1);
    expect(retention.purge).toHaveBeenCalledTimes(1);
  });

  it('dispatches pending push notices on every tick', async () => {
    const { scheduler, pushDispatcher } = build();

    await scheduler.dispatchPush();

    expect(pushDispatcher.dispatchPending).toHaveBeenCalledTimes(1);
  });

  it('stays idle when the instance opted out', async () => {
    const { scheduler, reminders, retention, pushDispatcher } = build(false);

    await scheduler.sendReminders();
    await scheduler.dispatchPush();
    await scheduler.purgeOldNotifications();

    expect(pushDispatcher.dispatchPending).not.toHaveBeenCalled();
    expect(reminders.sendDue).not.toHaveBeenCalled();
    expect(retention.purge).not.toHaveBeenCalled();
  });

  it('does not start a second reminder run while one is still going', async () => {
    const { scheduler, reminders } = build();
    let finish: () => void = () => undefined;
    reminders.sendDue.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));

    const first = scheduler.sendReminders();
    await scheduler.sendReminders();
    finish();
    await first;

    expect(reminders.sendDue).toHaveBeenCalledTimes(1);
  });

  it('survives a failing run and tries again on the next tick', async () => {
    const { scheduler, reminders } = build();
    reminders.sendDue.mockRejectedValueOnce(new Error('database down'));

    await expect(scheduler.sendReminders()).resolves.toBeUndefined();
    await scheduler.sendReminders();

    expect(reminders.sendDue).toHaveBeenCalledTimes(2);
  });
});
