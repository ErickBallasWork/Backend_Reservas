import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  FLOOR_RESOURCE_TYPES,
  FLOOR_ZONE_KINDS,
  type FloorResourceType,
  type FloorZoneKind,
} from '../../common/constants';

const MAX_DIMENSION = 100_000;
const MAX_ZONES = 500;

export class ListFloorPlansQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiPropertyOptional({ description: 'true also returns inactive plans (administrators only)' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}

export class CreateFloorPlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  buildingId!: string;

  @ApiProperty({ example: 'Planta principal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ description: 'Width of the drawing in plan units', example: 900 })
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION)
  width!: number;

  @ApiProperty({ description: 'Height of the drawing in plan units', example: 600 })
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION)
  height!: number;

  @ApiPropertyOptional({ description: 'Floor number; 0 when omitted', default: 0 })
  @IsOptional()
  @IsInt()
  level?: number;
}

export class UpdateFloorPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION)
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION)
  height?: number;

  @ApiPropertyOptional({ description: 'false hides the plan from non-administrators' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class FloorZoneInputDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Existing zone to update; omit to create' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Board' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: FLOOR_ZONE_KINDS, enumName: 'FloorZoneKind' })
  @IsIn([...FLOOR_ZONE_KINDS])
  kind!: FloorZoneKind;

  @ApiProperty()
  @IsInt()
  @Min(0)
  x!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  y!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  width!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  height!: number;

  @ApiProperty()
  @IsBoolean()
  isReservable!: boolean;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Room or AI lab the zone books. Required when the zone is reservable',
  })
  @IsOptional()
  @IsUUID()
  resourceId?: string | null;

  @ApiProperty()
  @IsInt()
  sortOrder!: number;
}

export class ReplaceFloorZonesDto {
  @ApiProperty({ type: [FloorZoneInputDto] })
  @IsArray()
  @ArrayMaxSize(MAX_ZONES)
  @ValidateNested({ each: true })
  @Type(() => FloorZoneInputDto)
  zones!: FloorZoneInputDto[];
}

export class FloorPlanStatusQueryDto {
  @ApiProperty({ description: 'Range start (ISO 8601)', example: '2026-11-12T15:00:00Z' })
  @IsDateString()
  from!: string;

  @ApiProperty({ description: 'Range end (ISO 8601), at most 48 h after from' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ enum: FLOOR_RESOURCE_TYPES, enumName: 'FloorResourceType' })
  @IsOptional()
  @IsIn([...FLOOR_RESOURCE_TYPES])
  type?: FloorResourceType;

  @ApiPropertyOptional({ description: 'Minimum capacity' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minCapacity?: number;
}
