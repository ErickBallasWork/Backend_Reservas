import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class DemoLoginDto {
  @ApiProperty({ description: 'Email of a demo user', example: 'admin@demo.com' })
  @IsEmail()
  email!: string;
}
