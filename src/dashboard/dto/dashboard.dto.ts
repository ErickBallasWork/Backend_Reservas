import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PURPOSES, RESERVATION_STATUSES } from '../../common/constants';
import { PaginationQueryDto } from '../../common/pagination.dto';

const FROM_DESCRIPTION = 'Range start (ISO 8601), applied to the reservation start';
const TO_DESCRIPTION = 'Range end (ISO 8601), exclusive';

export class MetricsQueryDto {
  @ApiPropertyOptional({ description: FROM_DESCRIPTION })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: TO_DESCRIPTION })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  buildingId?: string;
}

export class DashboardQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: FROM_DESCRIPTION })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: TO_DESCRIPTION })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiPropertyOptional({ enum: [...RESERVATION_STATUSES] })
  @IsOptional()
  @IsIn([...RESERVATION_STATUSES])
  status?: string;

  @ApiPropertyOptional({ enum: [...PURPOSES] })
  @IsOptional()
  @IsIn([...PURPOSES])
  purpose?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional({
    enum: ['true'],
    description: 'Set on automatic refreshes so they are not written to the audit log',
  })
  @IsOptional()
  @IsIn(['true'])
  refresh?: string;
}
