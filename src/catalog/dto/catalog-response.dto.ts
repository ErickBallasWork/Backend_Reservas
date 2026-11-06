import { ApiProperty } from '@nestjs/swagger';
import { RESOURCE_TYPES, type ResourceType } from '../../common/constants';

export class BuildingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class ResourceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  buildingId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  parentResourceId!: string | null;

  @ApiProperty({ enum: RESOURCE_TYPES, enumName: 'ResourceType' })
  type!: ResourceType;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  capacity!: number;

  @ApiProperty({ type: String, nullable: true })
  equipment!: string | null;

  @ApiProperty({ type: String, nullable: true })
  rules!: string | null;

  @ApiProperty({ type: String, nullable: true })
  assetTag!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class NamedReferenceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ResourceListItemResponseDto extends ResourceResponseDto {
  @ApiProperty({ type: NamedReferenceDto })
  building!: NamedReferenceDto;

  @ApiProperty({ type: NamedReferenceDto, nullable: true })
  parent!: NamedReferenceDto | null;
}

export class ResourceBuildingReferenceDto extends NamedReferenceDto {
  @ApiProperty()
  isActive!: boolean;
}

export class ResourceDetailResponseDto extends ResourceResponseDto {
  @ApiProperty({ type: ResourceBuildingReferenceDto })
  building!: ResourceBuildingReferenceDto;

  @ApiProperty({ type: NamedReferenceDto, nullable: true })
  parent!: NamedReferenceDto | null;

  @ApiProperty({ type: [ResourceResponseDto] })
  children!: ResourceResponseDto[];
}

export class FutureReservationUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;
}

export class FutureReservationResourceDto extends NamedReferenceDto {
  @ApiProperty({ enum: RESOURCE_TYPES, enumName: 'ResourceType' })
  type!: ResourceType;
}

export class FutureReservationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  purpose!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ format: 'date-time' })
  startDateTime!: Date;

  @ApiProperty({ format: 'date-time' })
  endDateTime!: Date;

  @ApiProperty({ type: FutureReservationUserDto })
  user!: FutureReservationUserDto;

  @ApiProperty({ type: FutureReservationResourceDto })
  resource!: FutureReservationResourceDto;
}

export class BuildingDetailResponseDto extends BuildingResponseDto {
  @ApiProperty({ type: [ResourceResponseDto] })
  resources!: ResourceResponseDto[];
}

export class CatalogResourceNodeDto extends ResourceResponseDto {
  @ApiProperty({ type: [ResourceResponseDto] })
  children!: ResourceResponseDto[];
}

export class CatalogBuildingNodeDto extends BuildingResponseDto {
  @ApiProperty({ type: [CatalogResourceNodeDto] })
  resources!: CatalogResourceNodeDto[];
}
