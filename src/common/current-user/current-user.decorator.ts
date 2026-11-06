import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type CurrentUserData } from './current-user.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData =>
    ctx.switchToHttp().getRequest<{ user: CurrentUserData }>().user,
);
