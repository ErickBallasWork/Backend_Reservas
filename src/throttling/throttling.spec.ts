import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import { AccessRequestsController } from '../access-requests/access-requests.controller';
import { AuthController } from '../auth/auth.controller';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { AppThrottlerGuard } from './app-throttler.guard';
import { RATE_LIMITS } from './rate-limits';

@Controller('probe')
class ProbeController {
  @Get()
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  hit() {
    return { ok: true };
  }
}

describe('AppThrottlerGuard', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ...RATE_LIMITS.global }] }),
      ],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 429 with a stable code and a Spanish message once the limit is spent', async () => {
    const statuses: number[] = [];
    let body: { code?: string; message?: string } = {};
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(`${baseUrl}/probe`);
      statuses.push(response.status);
      if (response.status === 429) body = (await response.json()) as typeof body;
    }

    expect(statuses).toEqual([200, 200, 429]);
    expect(body.code).toBe('TOO_MANY_REQUESTS');
    expect(body.message).toMatch(/demasiados intentos/i);
  });
});

describe('rate limits on public endpoints', () => {
  const limitOf = (controller: object, method: string) =>
    Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      (controller as Record<string, object>)[method],
    ) as number | undefined;

  it.each([
    [AccessRequestsController.prototype, 'create', RATE_LIMITS.accessRequest.limit],
    [AccessRequestsController.prototype, 'status', RATE_LIMITS.accessRequestStatus.limit],
    [AuthController.prototype, 'deviceSession', RATE_LIMITS.deviceSession.limit],
    [AuthController.prototype, 'refresh', RATE_LIMITS.refresh.limit],
    [AuthController.prototype, 'logout', RATE_LIMITS.logout.limit],
    [AuthController.prototype, 'demo', RATE_LIMITS.demoLogin.limit],
  ])('limits %p.%s', (prototype, method, expected) => {
    expect(limitOf(prototype, method)).toBe(expected);
  });

  it('keeps the access request creation stricter than the global limit', () => {
    expect(RATE_LIMITS.accessRequest.limit).toBeLessThan(RATE_LIMITS.global.limit);
  });
});
