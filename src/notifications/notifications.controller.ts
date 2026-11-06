import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { JobEndpoint } from '../common/guards/job-endpoint.decorator';
import { Throttle } from '@nestjs/throttler';
import { limitFor } from '../throttling/rate-limits';
import { NotificationsQueryDto } from './dto/notifications-query.dto';
import {
  MarkAllReadResponseDto,
  NotificationPageResponseDto,
  NotificationResponseDto,
  RunNotificationJobsResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders/reminders.service';

@ApiTags('Notificaciones')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly reminders: RemindersService,
  ) {}

  @Get()
  @Throttle(limitFor('notificationsPolling'))
  @ApiOkResponse({ type: NotificationPageResponseDto })
  @ApiOperation({ summary: 'Mi bandeja de avisos' })
  listMine(@CurrentUser() user: CurrentUserData, @Query() query: NotificationsQueryDto) {
    return this.notifications.listMine(user.id, query);
  }

  @Get('unread-count')
  @Throttle(limitFor('notificationsPolling'))
  @ApiOkResponse({ type: UnreadCountResponseDto })
  @ApiOperation({ summary: 'Número de avisos sin leer (para el contador)' })
  unreadCount(@CurrentUser() user: CurrentUserData) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch('read-all')
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  @ApiOperation({ summary: 'Marcar todos mis avisos como leídos' })
  markAllRead(@CurrentUser() user: CurrentUserData) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiOperation({ summary: 'Marcar un aviso como leído' })
  markRead(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @JobEndpoint()
  @Post('jobs/run')
  @ApiCreatedResponse({ type: RunNotificationJobsResponseDto })
  @ApiOperation({ summary: 'Tarea programada: crear los recordatorios que ya corresponden' })
  runJobs() {
    return this.reminders.sendDue();
  }
}
