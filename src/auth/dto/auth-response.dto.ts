import { ApiProperty } from '@nestjs/swagger';
import { ROLES, type Role } from '../../common/constants';

export class CurrentUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: ROLES, enumName: 'Role', isArray: true })
  roles!: Role[];

  @ApiProperty({ type: [String], format: 'uuid' })
  spocBuildingIds!: string[];
}

export class SessionResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ description: 'Seconds until the token expires' })
  expiresIn!: number;

  @ApiProperty({ type: CurrentUserResponseDto })
  user!: CurrentUserResponseDto;
}
