import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './app-throttler.guard';
import { RATE_LIMITS } from './rate-limits';

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ...RATE_LIMITS.global }] })],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class ThrottlingModule {}
