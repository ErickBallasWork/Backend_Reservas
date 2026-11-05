import { ApiProperty } from '@nestjs/swagger';
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
import { RESOURCE_TYPES } from '../../common/constants';

export class CreateResourceDto {
  /** MEETING_ROOM (sala), AI_LAB (laboratorio de IA) o LAPTOP */
  @ApiProperty({ enum: [...RESOURCE_TYPES] })
  @IsIn([...RESOURCE_TYPES])
  type: string;

  /** Obligatorio para salas y laboratorios. Para una laptop se toma el edificio de su laboratorio. */
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  /** Solo LAPTOP: id del laboratorio de IA al que pertenece */
  @IsOptional()
  @IsUUID()
  parentResourceId?: string;

  /** Nombre (único dentro del edificio), por ejemplo "Sala Cotopaxi" o "LAP-IA-06" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  /** Número de personas (para laptops, 1) */
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

  /** Solo LAPTOP: código de inventario */
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

  /** Solo LAPTOP: moverla a otro laboratorio */
  @IsOptional()
  @IsUUID()
  parentResourceId?: string;

  /** false para inactivar (no se borra) */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListResourcesQueryDto {
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiProperty({ enum: [...RESOURCE_TYPES], required: false })
  @IsOptional()
  @IsIn([...RESOURCE_TYPES])
  type?: string;

  /** Laptops de un laboratorio */
  @IsOptional()
  @IsUUID()
  parentResourceId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;

  /** Capacidad mínima */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minCapacity?: number;
}
