import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';

export const JOB_KEY_HEADER = 'x-job-key';

@Injectable()
export class JobKeyGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.jobs.jobKey;
    if (!expected) return true;
    const provided = context.switchToHttp().getRequest<Request>().header(JOB_KEY_HEADER);
    if (provided !== expected) {
      throw new UnauthorizedException({
        code: 'INVALID_JOB_KEY',
        message: 'Clave de tarea inválida',
      });
    }
    return true;
  }
}
