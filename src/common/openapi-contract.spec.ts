import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AccessRequestsController } from '../access-requests/access-requests.controller';
import { AccessRequestsService } from '../access-requests/access-requests.service';
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
import { ReservationsController } from '../reservations/reservations.controller';
import { ReservationsService } from '../reservations/reservations.service';
import { PrismaService } from '../prisma/prisma.service';
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
  ['get', '/availability/search'],
  ['get', '/availability/resources/{id}'],
  ['post', '/reservations'],
  ['get', '/reservations/mine'],
  ['get', '/reservations/{id}'],
  ['patch', '/reservations/{id}/cancel'],
  ['post', '/reservations/{id}/check-in'],
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
