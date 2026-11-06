import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class NotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'true returns only unread notifications' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}
