import { Injectable } from '@nestjs/common';
import { Status } from '../../common/constants';
import { AppConfigService } from '../../config/app-config.service';
import { ReservationRulesService } from '../../config/reservation-rules.service';
import { PrismaService } from '../../prisma/prisma.service';
import { describeResource } from '../../reservations/reservation-resources';
import { NotificationsService } from '../notifications.service';
import { buildReminderNotice, REMINDER_TITLE } from './reminder-notice';

const MINUTE_MS = 60_000;
const BATCH_SIZE = 200;

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly rules: ReservationRulesService,
    private readonly appConfig: AppConfigService,
  ) {}

  async sendDue(now = new Date()): Promise<{ reminded: number }> {
    const { reminderLeadMin, checkinBeforeMin } = this.rules.current();
    const { timeZone } = this.appConfig.server;
    const due = await this.prisma.reservation.findMany({
      where: {
        status: Status.CONFIRMED,
        reminderSentAt: null,
        startDateTime: { gt: now, lte: new Date(now.getTime() + reminderLeadMin * MINUTE_MS) },
      },
      select: {
        id: true,
        userId: true,
        startDateTime: true,
        endDateTime: true,
        resource: { select: { type: true, name: true, parent: { select: { name: true } } } },
      },
      orderBy: { startDateTime: 'asc' },
      take: BATCH_SIZE,
    });

    let reminded = 0;
    for (const reservation of due) {
      const sent = await this.prisma.$transaction(async (tx) => {
        // Only the instance that flips the guard first sends the reminder.
        const claimed = await tx.reservation.updateMany({
          where: { id: reservation.id, status: Status.CONFIRMED, reminderSentAt: null },
          data: { reminderSentAt: now },
        });
        if (claimed.count === 0) return false;
        await this.notifications.notify(
          {
            userId: reservation.userId,
            reservationId: reservation.id,
            type: 'RESERVATION_REMINDER',
            title: REMINDER_TITLE,
            message: buildReminderNotice({
              label: describeResource(reservation.resource),
              startDateTime: reservation.startDateTime,
              endDateTime: reservation.endDateTime,
              checkinBeforeMin,
              timeZone,
            }),
            eventAt: reservation.startDateTime,
            expiresAt: reservation.startDateTime,
          },
          tx,
        );
        return true;
      });
      if (sent) reminded++;
    }
    return { reminded };
  }
}
