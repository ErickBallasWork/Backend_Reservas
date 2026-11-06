import { ApiProperty } from '@nestjs/swagger';
import {
  FLOOR_RESOURCE_TYPES,
  FLOOR_STATE_REASONS,
  FLOOR_STATES,
  FLOOR_ZONE_KINDS,
  type FloorResourceType,
  type FloorState,
  type FloorStateReason,
  type FloorZoneKind,
} from '../../common/constants';

export class FloorPlanSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  buildingId!: string;

  @ApiProperty()
  buildingName!: string;

  @ApiProperty()
  level!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  width!: number;

  @ApiProperty()
  height!: number;

  @ApiProperty()
  isActive!: boolean;
}

export class FloorZoneResourceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: FLOOR_RESOURCE_TYPES, enumName: 'FloorResourceType' })
  type!: FloorResourceType;

  @ApiProperty()
  capacity!: number;

  @ApiProperty()
  isActive!: boolean;
}

export class FloorSeatDto {
  @ApiProperty({ format: 'uuid' })
  resourceId!: string;

  @ApiProperty()
  name!: string;
}

export class FloorZoneDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: FLOOR_ZONE_KINDS, enumName: 'FloorZoneKind' })
  kind!: FloorZoneKind;

  @ApiProperty()
  x!: number;

  @ApiProperty()
  y!: number;

  @ApiProperty()
  width!: number;

  @ApiProperty()
  height!: number;

  @ApiProperty()
  isReservable!: boolean;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  resourceId!: string | null;

  @ApiProperty({ type: FloorZoneResourceDto, nullable: true })
  resource!: FloorZoneResourceDto | null;

  @ApiProperty({
    type: [FloorSeatDto],
    description: 'Active laptops of the linked AI lab, sorted by name. Empty for other zones',
  })
  seats!: FloorSeatDto[];
}

export class FloorPlanDetailDto extends FloorPlanSummaryDto {
  @ApiProperty({ type: [FloorZoneDto], description: 'Sorted by sortOrder' })
  zones!: FloorZoneDto[];
}

export class FloorZoneStatusDto {
  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({ enum: FLOOR_STATES, enumName: 'FloorState' })
  state!: FloorState;

  @ApiProperty({ enum: FLOOR_STATE_REASONS, enumName: 'FloorStateReason', nullable: true })
  reason!: FloorStateReason | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Active laptops of a lab zone' })
  totalSeats!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Laptops with no busy slot' })
  freeSeats!: number | null;
}

export class FloorSeatStatusDto {
  @ApiProperty({ format: 'uuid' })
  resourceId!: string;

  @ApiProperty({ enum: FLOOR_STATES, enumName: 'FloorState' })
  state!: FloorState;
}

export class FloorPlanStatusDto {
  @ApiProperty({ format: 'uuid' })
  floorPlanId!: string;

  @ApiProperty({ format: 'date-time' })
  from!: string;

  @ApiProperty({ format: 'date-time' })
  to!: string;

  @ApiProperty({ type: [FloorZoneStatusDto] })
  zones!: FloorZoneStatusDto[];

  @ApiProperty({ type: [FloorSeatStatusDto] })
  seats!: FloorSeatStatusDto[];
}
