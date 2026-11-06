import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export const REPORT_GROUPS = ['resource', 'building', 'laptop'] as const;

export class DateRangeQueryDto {
  @ApiProperty({ description: 'Range start (ISO 8601)', example: '2026-11-01T05:00:00Z' })
  @IsDateString()
  from!: string;

  @ApiProperty({
    description: 'Range end (ISO 8601). One year at most',
    example: '2026-12-01T05:00:00Z',
  })
  @IsDateString()
  to!: string;
}

export class OccupancyQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'resource: rooms and labs, building: totals per building, laptop: each laptop',
    enum: [...REPORT_GROUPS],
    default: 'resource',
  })
  @IsOptional()
  @IsIn([...REPORT_GROUPS])
  groupBy?: string;
}
