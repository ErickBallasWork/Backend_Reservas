import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class RangeQueryDto {
  @ApiProperty({ description: 'Range start (ISO 8601)', example: '2026-11-12T13:00:00Z' })
  @IsDateString()
  from!: string;

  @ApiProperty({ description: 'Range end (ISO 8601)', example: '2026-11-12T23:00:00Z' })
  @IsDateString()
  to!: string;
}

export class SearchAvailabilityQueryDto extends RangeQueryDto {
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiPropertyOptional({
    description: 'Meeting rooms or AI labs',
    enum: ['MEETING_ROOM', 'AI_LAB'],
  })
  @IsOptional()
  @IsIn(['MEETING_ROOM', 'AI_LAB'])
  type?: string;

  @ApiPropertyOptional({ description: 'Minimum capacity' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minCapacity?: number;
}
