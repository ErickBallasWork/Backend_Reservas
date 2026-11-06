import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { Public } from '../current-user/public.decorator';
import { JOB_KEY_HEADER, JobKeyGuard } from './job-key.guard';

export function JobEndpoint() {
  return applyDecorators(
    Public(),
    UseGuards(JobKeyGuard),
    ApiHeader({ name: JOB_KEY_HEADER, required: false }),
  );
}
