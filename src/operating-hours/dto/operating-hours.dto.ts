import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const OPERATING_HOURS_SOURCES = ['OWN', 'PARENT', 'GLOBAL', 'ALWAYS_OPEN'] as const;
export type OperatingHoursSource = (typeof OPERATING_HOURS_SOURCES)[number];

export class OperatingWindowDto {
  @ApiProperty({ description: '0 is Sunday, 6 is Saturday', minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '08:00', description: 'Local time HH:mm' })
  @Matches(TIME_OF_DAY)
  opensAt!: string;

  @ApiProperty({ example: '18:00', description: 'Local time HH:mm, 24:00 allowed' })
  @Matches(TIME_OF_DAY)
  closesAt!: string;
}

export class OperatingHoursQueryDto {
  @ApiPropertyOptional({ description: 'Resource to read. Omit it for the global schedule' })
  @IsOptional()
  @IsUUID()
  resourceId?: string;
}

export class ReplaceOperatingHoursDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Resource that gets its own schedule. Omit it for the global schedule',
  })
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiProperty({
    type: [OperatingWindowDto],
    description:
      'Complete weekly schedule. An empty list removes it: the resource then inherits and the global one goes back to open 24/7',
  })
  @IsArray()
  @ArrayMaxSize(70)
  @ValidateNested({ each: true })
  @Type(() => OperatingWindowDto)
  windows!: OperatingWindowDto[];
}

export class OperatingHoursResponseDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  resourceId!: string | null;

  @ApiProperty({
    enum: OPERATING_HOURS_SOURCES,
    enumName: 'OperatingHoursSource',
    description: 'Where the effective schedule comes from',
  })
  source!: OperatingHoursSource;

  @ApiProperty({ type: [OperatingWindowDto], description: 'Effective weekly schedule' })
  windows!: OperatingWindowDto[];
}

export class CreateClosedDateDto {
  @ApiProperty({ example: '2026-12-25', description: 'Local date YYYY-MM-DD' })
  @Matches(DATE_ONLY)
  date!: string;

  @ApiProperty({ example: 'Navidad' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Resource that closes that day. Omit it to close every resource',
  })
  @IsOptional()
  @IsUUID()
  resourceId?: string;
}

export class ClosedDateResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  resourceId!: string | null;

  @ApiProperty({ example: '2026-12-25' })
  date!: string;

  @ApiProperty()
  name!: string;
}
