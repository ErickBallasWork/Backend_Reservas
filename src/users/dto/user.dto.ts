import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ROLES } from '../../common/constants';

export class RoleAssignmentDto {
  @ApiProperty({ enum: [...ROLES] })
  @IsIn([...ROLES])
  role!: string;

  @ApiPropertyOptional({ description: 'Required for SPOC_EDIFICIO: the building it manages' })
  @IsOptional()
  @IsUUID()
  buildingId?: string;
}

export class CreateUserDto {
  @ApiProperty({ description: 'Corporate email used to sign in' })
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @ApiPropertyOptional({
    description: 'Defaults to ASOCIADO when omitted',
    type: [RoleAssignmentDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles?: RoleAssignmentDto[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'false deactivates the user, who can no longer sign in' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @ApiPropertyOptional({
    description: 'Replaces every role of the user',
    type: [RoleAssignmentDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles?: RoleAssignmentDto[];
}
