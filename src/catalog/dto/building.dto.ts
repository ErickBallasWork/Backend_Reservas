import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBuildingDto {
  @ApiProperty({ description: 'Unique building name' })
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
  @ApiPropertyOptional({ description: 'false deactivates the building without deleting it' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListBuildingsQueryDto {
  @ApiPropertyOptional({ description: 'true also returns inactive buildings' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}
