import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PURPOSES, RESERVATION_STATUSES } from '../../common/constants';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class MetricsQueryDto {
  /** Desde (ISO 8601), filtra por inicio de la reserva */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Hasta (ISO 8601) */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;
}

export class DashboardQueryDto extends PaginationQueryDto {
  /** Desde (ISO 8601), filtra por inicio de la reserva */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Hasta (ISO 8601) */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiProperty({ enum: [...RESERVATION_STATUSES], required: false })
  @IsOptional()
  @IsIn([...RESERVATION_STATUSES])
  status?: string;

  @ApiProperty({ enum: [...PURPOSES], required: false })
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
