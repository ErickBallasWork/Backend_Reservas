import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(): Promise<void> {
    throw new HttpException(
      {
        code: 'TOO_MANY_REQUESTS',
        message: 'Hiciste demasiados intentos. Espera un momento y vuelve a intentarlo.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
