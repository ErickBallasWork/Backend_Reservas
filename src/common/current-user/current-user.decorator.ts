import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CurrentUserData } from './current-user.types';

// Uso en un controller:  miMetodo(@CurrentUser() user: CurrentUserData)
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData => ctx.switchToHttp().getRequest().user,
);
