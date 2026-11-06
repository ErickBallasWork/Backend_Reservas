import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { JobEndpoint } from '../common/guards/job-endpoint.decorator';
import { NotificationsQueryDto } from './notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notificaciones')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mi bandeja de avisos (la app la consulta cada 30 s)' })
  listMine(@CurrentUser() user: CurrentUserData, @Query() query: NotificationsQueryDto) {
    return this.notifications.listMine(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Número de avisos sin leer (para la campana)' })
  unreadCount(@CurrentUser() user: CurrentUserData) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todos mis avisos como leídos' })
  markAllRead(@CurrentUser() user: CurrentUserData) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar un aviso como leído' })
  markRead(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @JobEndpoint()
  @Post('pending/run')
  @ApiOperation({ summary: 'Tarea programada: enviar los avisos pendientes por push o e-mail' })
  runPending() {
    return this.notifications.processPending();
  }
}
