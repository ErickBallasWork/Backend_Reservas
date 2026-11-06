import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { RESOURCE_TYPES, type ResourceType } from '../../common/constants';

export class CreateResourceDto {
  @ApiProperty({ enum: RESOURCE_TYPES, enumName: 'ResourceType' })
  @IsIn([...RESOURCE_TYPES])
  type!: ResourceType;

  @ApiPropertyOptional({
    description: 'Required for rooms and labs. A laptop takes the building of its lab',
  })
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiPropertyOptional({ description: 'LAPTOP only: id of the AI lab it belongs to' })
  @IsOptional()
  @IsUUID()
  parentResourceId?: string;

  @ApiProperty({ description: 'Unique within the building', example: 'Sala Cotopaxi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ description: 'Number of people (1 for laptops)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  equipment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rules?: string;

  @ApiPropertyOptional({ description: 'LAPTOP only: inventory code' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  assetTag?: string;
}

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  equipment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rules?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  assetTag?: string;

  @ApiPropertyOptional({ description: 'LAPTOP only: moves it to another lab' })
  @IsOptional()
  @IsUUID()
  parentResourceId?: string;

  @ApiPropertyOptional({ description: 'false deactivates the resource without deleting it' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListResourcesQueryDto {
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiPropertyOptional({ enum: RESOURCE_TYPES, enumName: 'ResourceType' })
  @IsOptional()
  @IsIn([...RESOURCE_TYPES])
  type?: ResourceType;

  @ApiPropertyOptional({ description: 'Returns the laptops of this lab' })
  @IsOptional()
  @IsUUID()
  parentResourceId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional({ description: 'Minimum capacity' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minCapacity?: number;
}
