import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  /** El "credential" (ID token) que entrega el botón de Google en el frontend */
  @IsString()
  @IsNotEmpty()
  credential: string;
}

export class DemoLoginDto {
  /** Correo de un usuario demo, por ejemplo admin@demo.com */
  @IsEmail()
  email: string;
}
