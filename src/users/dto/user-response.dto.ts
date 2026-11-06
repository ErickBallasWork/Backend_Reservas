import { ApiProperty } from '@nestjs/swagger';
import { CurrentUserResponseDto } from '../../auth/dto/auth-response.dto';
import { ROLES, type Role } from '../../common/constants';

export class RoleResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ enum: ROLES, enumName: 'Role' })
  name!: Role;
}

export class UserRoleResponseDto {
  @ApiProperty({ enum: ROLES, enumName: 'Role' })
  role!: Role;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  buildingId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  building!: string | null;
}

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ type: String, nullable: true })
  department!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: Date | null;

  @ApiProperty({ type: [UserRoleResponseDto] })
  roles!: UserRoleResponseDto[];
}

export class ActiveSanctionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  startDate!: Date;
}

export class MeResponseDto extends CurrentUserResponseDto {
  @ApiProperty({ type: ActiveSanctionResponseDto, nullable: true })
  activeSanction!: ActiveSanctionResponseDto | null;
}

export class ManagedAssociateResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ type: String, nullable: true })
  department!: string | null;
}
