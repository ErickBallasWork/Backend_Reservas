import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

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
