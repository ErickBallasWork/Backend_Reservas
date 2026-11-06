import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NamedReferenceDto } from '../../catalog/dto/catalog-response.dto';
import { RESOURCE_TYPES, type ResourceType } from '../../common/constants';

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

  @ApiProperty({
    description: 'No slot is occupied in the range. An AI lab also needs all its laptops free',
  })
  free!: boolean;

  @ApiPropertyOptional()
  totalLaptops?: number;

  @ApiPropertyOptional()
  freeLaptops?: number;
}
