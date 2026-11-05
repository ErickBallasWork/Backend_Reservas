import { ApiProperty } from '@nestjs/swagger';
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
  role: string;

  /** Obligatorio para SPOC_EDIFICIO: id del edificio que administra */
  @IsOptional()
  @IsUUID()
  buildingId?: string;
}

export class CreateUserDto {
  /** Correo corporativo con el que entrará con Google */
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  /** Si no se envía, queda como ASOCIADO */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles?: RoleAssignmentDto[];
}

export class UpdateUserDto {
  /** false para desactivar: ya no podrá iniciar sesión */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  /** Reemplaza todos los roles del usuario */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles?: RoleAssignmentDto[];
}
