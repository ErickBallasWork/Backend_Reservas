import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class DemoLoginDto {
  @ApiProperty({ description: 'Email of a demo user', example: 'admin@demo.com' })
  @IsEmail()
  email!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token of the approved device' })
  @IsString()
  @Length(43, 128)
  refreshToken!: string;
}

export class SuperadminLoginDto {
  @ApiProperty({ description: 'Initial SUPERADMIN email', example: 'admin@tcs.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ description: 'Testing only: the password is the same email' })
  @IsString()
  @MaxLength(320)
  password!: string;
}
