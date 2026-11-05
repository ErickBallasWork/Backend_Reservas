import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export const REPORT_GROUPS = ['resource', 'building', 'laptop'] as const;

export class DateRangeQueryDto {
  /** Desde (ISO 8601) */
  @ApiProperty({ example: '2026-11-01T05:00:00Z' })
  @IsDateString()
  from: string;

  /** Hasta (ISO 8601). Máximo un año. */
  @ApiProperty({ example: '2026-12-01T05:00:00Z' })
  @IsDateString()
  to: string;
}

export class OccupancyQueryDto extends DateRangeQueryDto {
  /** resource = salas y laboratorios; building = suma por edificio; laptop = cada laptop */
  @ApiProperty({ enum: [...REPORT_GROUPS], required: false, default: 'resource' })
  @IsOptional()
  @IsIn([...REPORT_GROUPS])
  groupBy?: string;
}
