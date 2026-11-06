import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AccessRequestsController } from '../access-requests/access-requests.controller';
import { AccessRequestsService } from '../access-requests/access-requests.service';
import { ApprovalsController } from '../approvals/approvals.controller';
import { ApprovalsService } from '../approvals/approvals.service';
import { AvailabilityController } from '../availability/availability.controller';
import { AvailabilityService } from '../availability/availability.service';
import { AuthController } from '../auth/auth.controller';
import { DevicesController } from '../auth/devices.controller';
import { DevicesService } from '../auth/devices.service';
import { AuthService } from '../auth/auth.service';
import { BuildingsController } from '../catalog/buildings.controller';
import { BuildingsService } from '../catalog/buildings.service';
import { CatalogController } from '../catalog/catalog.controller';
import { CatalogTreeService } from '../catalog/catalog-tree.service';
import { ResourcesController } from '../catalog/resources.controller';
import { ResourcesService } from '../catalog/resources.service';
import { AppConfigService } from '../config/app-config.service';
import { ReallocationsController } from '../reallocations/reallocations.controller';
import { ReallocationsService } from '../reallocations/reallocations.service';
import { SpocAgendaService } from '../reallocations/spoc-agenda.service';
import { ReservationEditService } from '../reservations/reservation-edit.service';
import { ReservationSeriesController } from '../reservations/series/reservation-series.controller';
import { ReservationSeriesService } from '../reservations/series/reservation-series.service';
import { ReservationsController } from '../reservations/reservations.controller';
import { ReservationsService } from '../reservations/reservations.service';
import { NotificationsController } from '../notifications/notifications.controller';
import { NotificationsService } from '../notifications/notifications.service';
import { PushDispatcherService } from '../notifications/push/push-dispatcher.service';
import { PushSubscriptionsService } from '../notifications/push/push-subscriptions.service';
import { RemindersService } from '../notifications/reminders/reminders.service';
import { OperatingHoursController } from '../operating-hours/operating-hours.controller';
import { OperatingHoursService } from '../operating-hours/operating-hours.service';
import { PrismaService } from '../prisma/prisma.service';
import { SanctionsController } from '../sanctions/sanctions.controller';
import { SanctionsService } from '../sanctions/sanctions.service';
import { ManagedAssociatesController } from '../users/managed-associates.controller';
import { ManagedAssociatesService } from '../users/managed-associates.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { RESERVATION_STATUSES } from './constants';
import { ERROR_CODES } from './error-codes';

type Operation = { responses: Record<string, { content?: Record<string, unknown> }> };

const DOCUMENTED_OPERATIONS: [string, string][] = [
  ['get', '/catalog/tree'],
  ['get', '/buildings'],
  ['get', '/buildings/{id}'],
  ['post', '/buildings'],
  ['patch', '/buildings/{id}'],
  ['get', '/resources'],
  ['get', '/resources/{id}'],
  ['get', '/resources/{id}/future-reservations'],
  ['get', '/buildings/{id}/future-reservations'],
  ['post', '/resources'],
  ['patch', '/resources/{id}'],
  ['post', '/auth/demo'],
  ['post', '/auth/device-session'],
  ['post', '/auth/refresh'],
  ['get', '/users/{userId}/devices'],
  ['get', '/me'],
  ['get', '/roles'],
  ['get', '/users'],
  ['patch', '/users/{id}'],
  ['get', '/users/{id}/managed-associates'],
  ['put', '/users/{id}/managed-associates'],
  ['post', '/access-requests'],
  ['post', '/access-requests/status'],
  ['get', '/access-requests'],
  ['post', '/access-requests/{id}/approve'],
  ['post', '/access-requests/{id}/reject'],
  ['get', '/operating-hours'],
  ['put', '/operating-hours'],
  ['get', '/closed-dates'],
  ['post', '/closed-dates'],
  ['get', '/availability/search'],
  ['get', '/availability/resources/{id}'],
  ['post', '/reservations'],
  ['get', '/reservations/mine'],
  ['get', '/reservations/{id}'],
  ['post', '/reservation-series/preview'],
  ['post', '/reservation-series'],
  ['get', '/reservation-series/{id}'],
  ['patch', '/reservation-series/{id}/cancel'],
  ['patch', '/reservations/{id}'],
  ['patch', '/reservations/{id}/cancel'],
  ['post', '/reservations/{id}/check-in'],
  ['get', '/approvals/pending'],
  ['post', '/approvals/{reservationId}'],
  ['post', '/approvals/series/{seriesId}'],
  ['get', '/spoc/agenda'],
  ['post', '/reservations/{id}/reallocate'],
  ['get', '/sanctions'],
  ['patch', '/sanctions/{id}/resolve'],
  ['post', '/sanctions/no-show/run'],
  ['get', '/notifications'],
  ['get', '/notifications/unread-count'],
  ['patch', '/notifications/read-all'],
  ['patch', '/notifications/{id}/read'],
  ['post', '/notifications/jobs/run'],
  ['get', '/notifications/push-config'],
  ['put', '/notifications/push-subscription'],
  ['delete', '/notifications/push-subscription'],
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AuthController,
        AccessRequestsController,
        DevicesController,
        UsersController,
        ManagedAssociatesController,
        BuildingsController,
        CatalogController,
        ResourcesController,
        AvailabilityController,
        ReservationsController,
        OperatingHoursController,
        ReservationSeriesController,
        ApprovalsController,
        ReallocationsController,
        SanctionsController,
        NotificationsController,
      ],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: AccessRequestsService, useValue: {} },
        { provide: DevicesService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: ManagedAssociatesService, useValue: {} },
        { provide: AppConfigService, useValue: {} },
        { provide: BuildingsService, useValue: {} },
        { provide: ResourcesService, useValue: {} },
        { provide: CatalogTreeService, useValue: {} },
        { provide: AvailabilityService, useValue: {} },
        { provide: ReservationsService, useValue: {} },
        { provide: ReservationEditService, useValue: {} },
        { provide: ReservationSeriesService, useValue: {} },
        { provide: OperatingHoursService, useValue: {} },
        { provide: ApprovalsService, useValue: {} },
        { provide: ReallocationsService, useValue: {} },
        { provide: SpocAgendaService, useValue: {} },
        { provide: SanctionsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: RemindersService, useValue: {} },
        { provide: PushSubscriptionsService, useValue: {} },
        { provide: PushDispatcherService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(DOCUMENTED_OPERATIONS)('declares a typed success response for %s %s', (method, path) => {
    const operation = (document.paths[path] as Record<string, Operation>)[method];
    const success = Object.entries(operation.responses).find(([status]) => status.startsWith('2'));

    expect(success?.[1].content?.['application/json']).toBeDefined();
  });

  it.each(['/catalog/tree', '/buildings/{id}', '/resources/{id}'])(
    'declares the error schema for GET %s',
    (path) => {
      const operation = (document.paths[path] as Record<string, Operation>).get;

      expect(Object.keys(operation.responses)).toContain('401');
    },
  );

  it('publishes the domain enums by name', () => {
    const schemas = document.components?.schemas ?? {};
    const serialize = (name: string) => JSON.stringify(schemas[name]);

    expect(serialize('ResourceResponseDto')).toContain('#/components/schemas/ResourceType');
    expect(serialize('CurrentUserResponseDto')).toContain('#/components/schemas/Role');
    expect(serialize('ApiErrorResponseDto')).toContain('#/components/schemas/ErrorCode');
    expect(serialize('ReservationResponseDto')).toContain('#/components/schemas/ReservationStatus');
    expect(schemas.ReservationStatus).toMatchObject({ enum: [...RESERVATION_STATUSES] });
    expect(schemas.ResourceType).toMatchObject({ enum: ['MEETING_ROOM', 'AI_LAB', 'LAPTOP'] });
  });
});

describe('error code registry', () => {
  const sources = sourceFiles(join(__dirname, '..')).map((file) => readFileSync(file, 'utf8'));
  const usedCodes = new Set(
    sources.flatMap((text) =>
      [...text.matchAll(/(?:code:\s*|RuleViolation\(\s*)'([A-Z_]+)'/g)].map((match) => match[1]),
    ),
  );

  it('contains every code thrown by the backend', () => {
    const missing = [...usedCodes].filter(
      (code) => !(ERROR_CODES as readonly string[]).includes(code),
    );

    expect(missing).toEqual([]);
  });
});
