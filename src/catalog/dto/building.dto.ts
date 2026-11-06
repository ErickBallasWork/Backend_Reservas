import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBuildingDto {
  /** Nombre único del edificio */
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class UpdateBuildingDto extends PartialType(CreateBuildingDto) {
  /** false para inactivar (no se borra) */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListBuildingsQueryDto {
  /** true para incluir también los inactivos */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}
