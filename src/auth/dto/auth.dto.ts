import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID token ("credential") returned by the sign-in button' })
  @IsString()
  @IsNotEmpty()
  credential!: string;
}

export class DemoLoginDto {
  @ApiProperty({ description: 'Email of a demo user', example: 'admin@demo.com' })
  @IsEmail()
  email!: string;
}
