import { ApiProperty } from '@nestjs/swagger';

const COUNTS_SCHEMA = {
  type: 'object',
  additionalProperties: { type: 'number' },
} as const;

export class DashboardMetricsResponseDto {
  @ApiProperty()
  total!: number;

  @ApiProperty(COUNTS_SCHEMA)
  byStatus!: Record<string, number>;

  @ApiProperty(COUNTS_SCHEMA)
  byPurpose!: Record<string, number>;

  @ApiProperty(COUNTS_SCHEMA)
  byReservationType!: Record<string, number>;

  @ApiProperty({ description: 'NO_SHOW over CHECKED_IN + NO_SHOW, from 0 to 1' })
  noShowRate!: number;
}
