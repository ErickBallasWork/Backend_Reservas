import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { NotificationsQueryDto } from './dto/notifications-query.dto';
import {
  MarkAllReadResponseDto,
  NotificationPageResponseDto,
  NotificationResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notificaciones')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: NotificationPageResponseDto })
  @ApiOperation({ summary: 'Mi bandeja de avisos' })
  listMine(@CurrentUser() user: CurrentUserData, @Query() query: NotificationsQueryDto) {
    return this.notifications.listMine(user.id, query);
  }

  @Get('unread-count')
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
}
