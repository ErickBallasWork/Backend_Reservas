import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PURPOSES, RESERVATION_STATUSES } from '../../common/constants';
import { PaginationQueryDto } from '../../common/pagination.dto';

const FROM_DESCRIPTION = 'Range start (ISO 8601), applied to the reservation start';
const TO_DESCRIPTION = 'Range end (ISO 8601)';

export class MetricsQueryDto {
  @ApiPropertyOptional({ description: FROM_DESCRIPTION })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: TO_DESCRIPTION })
  @IsOptional()
  @IsDateString()
  to?: string;

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

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;
}
