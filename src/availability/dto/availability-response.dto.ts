import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NamedReferenceDto } from '../../catalog/dto/catalog-response.dto';
import { RESOURCE_TYPES, type ResourceType } from '../../common/constants';

export class OpenWindowDto {
  @ApiProperty({ format: 'date-time' })
  start!: string;

  @ApiProperty({ format: 'date-time' })
  end!: string;
}

export class LaptopAvailabilityDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    type: [String],
    format: 'date-time',
    description: 'Start of every occupied slot of the laptop in the range',
  })
  busySlots!: string[];

  @ApiProperty({ type: [OpenWindowDto], description: 'Ranges in which the laptop can be booked' })
  openWindows!: OpenWindowDto[];
}

export class ResourceAvailabilityResponseDto {
  @ApiProperty({ format: 'uuid' })
  resourceId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RESOURCE_TYPES, enumName: 'ResourceType' })
  type!: ResourceType;

  @ApiProperty({ description: 'Length of a slot in minutes' })
  slotMinutes!: number;

  @ApiProperty({ format: 'date-time' })
  from!: string;

  @ApiProperty({ format: 'date-time' })
  to!: string;

  @ApiProperty({
    type: [String],
    format: 'date-time',
    description: 'Start of every occupied slot of the resource in the range',
  })
  busySlots!: string[];

  @ApiProperty({
    type: [OpenWindowDto],
    description: 'Ranges inside the range in which the resource can be booked (RF-17)',
  })
  openWindows!: OpenWindowDto[];

  @ApiProperty({ type: [LaptopAvailabilityDto], description: 'Active laptops of an AI lab' })
  laptops!: LaptopAvailabilityDto[];
}

export class AvailabilitySearchItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RESOURCE_TYPES, enumName: 'ResourceType' })
  type!: ResourceType;

  @ApiProperty()
  capacity!: number;

  @ApiProperty({ type: String, nullable: true })
  equipment!: string | null;

  @ApiProperty({ type: NamedReferenceDto })
  building!: NamedReferenceDto;

  @ApiProperty({ description: 'The whole range is inside the operating hours' })
  open!: boolean;

  @ApiProperty({
    description:
      'Open and with no occupied slot in the range. An AI lab also needs all its laptops free',
  })
  free!: boolean;

  @ApiPropertyOptional()
  totalLaptops?: number;

  @ApiPropertyOptional()
  freeLaptops?: number;
}
