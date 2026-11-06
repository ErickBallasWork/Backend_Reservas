import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { AppConfigService } from '../config/app-config.service';
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
import {
  PushConfigResponseDto,
  PushSubscriptionResponseDto,
  RegisterPushSubscriptionDto,
  RemovePushSubscriptionDto,
  RemovePushSubscriptionResponseDto,
} from './push/dto/push.dto';
import { PushDispatcherService } from './push/push-dispatcher.service';
import { PushSubscriptionsService } from './push/push-subscriptions.service';
import { RemindersService } from './reminders/reminders.service';

@ApiTags('Notificaciones')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly reminders: RemindersService,
    private readonly pushSubscriptions: PushSubscriptionsService,
    private readonly pushDispatcher: PushDispatcherService,
    private readonly appConfig: AppConfigService,
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

  @Get('push-config')
  @ApiOkResponse({ type: PushConfigResponseDto })
  @ApiOperation({ summary: 'Clave pública para suscribir este navegador a los avisos push' })
  pushConfig() {
    const push = this.appConfig.push;
    return { enabled: push !== null, publicKey: push?.publicKey ?? null };
  }

  @Put('push-subscription')
  @ApiOkResponse({ type: PushSubscriptionResponseDto })
  @ApiOperation({ summary: 'Registrar este navegador para recibir avisos con la app cerrada' })
  registerPush(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: RegisterPushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.pushSubscriptions.register(user.id, dto, userAgent);
  }

  @Delete('push-subscription')
  @ApiOkResponse({ type: RemovePushSubscriptionResponseDto })
  @ApiOperation({ summary: 'Dejar de recibir avisos push en este navegador' })
  removePush(@CurrentUser() user: CurrentUserData, @Body() dto: RemovePushSubscriptionDto) {
    return this.pushSubscriptions.remove(user.id, dto.endpoint);
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
  async runJobs() {
    const { reminded } = await this.reminders.sendDue();
    const { sent, failed } = await this.pushDispatcher.dispatchPending();
    return { reminded, pushSent: sent, pushFailed: failed };
  }
}
