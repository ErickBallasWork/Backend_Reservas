import { ApiProperty } from '@nestjs/swagger';
import { NOTIFICATION_TYPES, type NotificationType } from '../../common/constants';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: NOTIFICATION_TYPES, enumName: 'NotificationType' })
  type!: NotificationType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  isRead!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class NotificationPageResponseDto {
  @ApiProperty()
  total!: number;

  @ApiProperty({ description: 'Unread notifications, regardless of the filter' })
  unread!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty({ type: [NotificationResponseDto] })
  items!: NotificationResponseDto[];
}

export class UnreadCountResponseDto {
  @ApiProperty()
  unread!: number;
}

export class MarkAllReadResponseDto {
  @ApiProperty()
  updated!: number;
}
