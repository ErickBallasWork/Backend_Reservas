import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class RangeQueryDto {
  /** Desde (ISO 8601), por ejemplo 2026-11-12T13:00:00Z */
  @ApiProperty({ example: '2026-11-12T13:00:00Z' })
  @IsDateString()
  from!: string;

  /** Hasta (ISO 8601) */
  @ApiProperty({ example: '2026-11-12T23:00:00Z' })
  @IsDateString()
  to!: string;
}

export class SearchAvailabilityQueryDto extends RangeQueryDto {
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  /** Salas o laboratorios */
  @ApiProperty({ enum: ['MEETING_ROOM', 'AI_LAB'], required: false })
  @IsOptional()
  @IsIn(['MEETING_ROOM', 'AI_LAB'])
  type?: string;

  /** Capacidad mínima */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minCapacity?: number;
}
