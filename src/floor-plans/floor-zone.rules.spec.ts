import { HttpException } from '@nestjs/common';
import {
  assertValidZones,
  assertZonesFit,
  linkedResourceIds,
  type LinkableResource,
  type ZoneDraft,
  type ZoneSetContext,
} from './floor-zone.rules';

const BUILDING = 'building-1';

const room: LinkableResource = {
  id: 'room',
  type: 'MEETING_ROOM',
  buildingId: BUILDING,
  isActive: true,
};
const lab: LinkableResource = { id: 'lab', type: 'AI_LAB', buildingId: BUILDING, isActive: true };
const laptop: LinkableResource = {
  id: 'laptop',
  type: 'LAPTOP',
  buildingId: BUILDING,
  isActive: true,
};

function zone(overrides: Partial<ZoneDraft> = {}): ZoneDraft {
  return {
    name: 'Zona',
    kind: 'DECORATIVE',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    isReservable: false,
    resourceId: null,
    ...overrides,
  };
}

function context(overrides: Partial<ZoneSetContext> = {}): ZoneSetContext {
  return {
    plan: { buildingId: BUILDING, width: 100, height: 50 },
    existingZoneIds: new Set(['zone-1']),
    resources: new Map([room, lab, laptop].map((resource) => [resource.id, resource])),
    linkedElsewhere: new Set(),
    ...overrides,
  };
}

function codeOf(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    if (!(error instanceof HttpException)) throw error;
    const response = error.getResponse();
    return typeof response === 'object' && 'code' in response ? response.code : undefined;
  }
  return undefined;
}

describe('assertZonesFit', () => {
  const plan = { width: 100, height: 50 };

  it('accepts a zone touching the plan edges', () => {
    expect(() =>
      assertZonesFit(plan, [zone({ x: 90, y: 40, width: 10, height: 10 })]),
    ).not.toThrow();
  });

  it.each([
    ['past the right edge', { x: 91 }],
    ['past the bottom edge', { y: 41 }],
    ['with a negative x', { x: -1 }],
    ['with a negative y', { y: -1 }],
    ['with no width', { width: 0 }],
    ['with no height', { height: 0 }],
  ])('rejects a zone %s', (_, overrides) => {
    expect(codeOf(() => assertZonesFit(plan, [zone(overrides)]))).toBe('FLOOR_ZONE_OUT_OF_BOUNDS');
  });
});

describe('assertValidZones', () => {
  it('accepts a room zone linked to a meeting room and a lab zone linked to a lab', () => {
    const zones = [
      zone({ kind: 'ROOM', isReservable: true, resourceId: 'room' }),
      zone({ kind: 'LAB', isReservable: true, resourceId: 'lab' }),
      zone({ kind: 'LABEL' }),
      zone({ id: 'zone-1', kind: 'ROOM' }),
    ];

    expect(() => assertValidZones(zones, context())).not.toThrow();
  });

  it('rejects an id that does not belong to the plan', () => {
    expect(codeOf(() => assertValidZones([zone({ id: 'other' })], context()))).toBe(
      'FLOOR_ZONE_NOT_FOUND',
    );
  });

  it('rejects the same zone id twice', () => {
    const zones = [zone({ id: 'zone-1' }), zone({ id: 'zone-1' })];

    expect(codeOf(() => assertValidZones(zones, context()))).toBe('DUPLICATE');
  });

  it('rejects a zone outside the plan', () => {
    expect(codeOf(() => assertValidZones([zone({ x: 95 })], context()))).toBe(
      'FLOOR_ZONE_OUT_OF_BOUNDS',
    );
  });

  it.each([
    ['a reservable zone without resource', { kind: 'ROOM' as const, isReservable: true }],
    [
      'a reservable decorative zone',
      { kind: 'DECORATIVE' as const, isReservable: true, resourceId: 'room' },
    ],
    ['a reservable label', { kind: 'LABEL' as const, isReservable: true, resourceId: 'room' }],
    ['a non reservable zone with a resource', { kind: 'ROOM' as const, resourceId: 'room' }],
    [
      'a room zone linked to a lab',
      { kind: 'ROOM' as const, isReservable: true, resourceId: 'lab' },
    ],
    [
      'a lab zone linked to a room',
      { kind: 'LAB' as const, isReservable: true, resourceId: 'room' },
    ],
    [
      'a zone linked to a laptop',
      { kind: 'LAB' as const, isReservable: true, resourceId: 'laptop' },
    ],
    [
      'a zone linked to an unknown resource',
      { kind: 'ROOM' as const, isReservable: true, resourceId: 'missing' },
    ],
  ])('rejects %s', (_, overrides) => {
    expect(codeOf(() => assertValidZones([zone(overrides)], context()))).toBe(
      'FLOOR_ZONE_RESOURCE_INVALID',
    );
  });

  it('rejects an inactive resource', () => {
    const resources = new Map([['room', { ...room, isActive: false }]]);
    const zones = [zone({ kind: 'ROOM', isReservable: true, resourceId: 'room' })];

    expect(codeOf(() => assertValidZones(zones, context({ resources })))).toBe(
      'FLOOR_ZONE_RESOURCE_INVALID',
    );
  });

  it('rejects a resource of another building', () => {
    const resources = new Map([['room', { ...room, buildingId: 'other' }]]);
    const zones = [zone({ kind: 'ROOM', isReservable: true, resourceId: 'room' })];

    expect(codeOf(() => assertValidZones(zones, context({ resources })))).toBe(
      'FLOOR_ZONE_RESOURCE_INVALID',
    );
  });

  it('rejects the same resource in two zones of the payload', () => {
    const linked = zone({ kind: 'ROOM', isReservable: true, resourceId: 'room' });

    expect(codeOf(() => assertValidZones([linked, { ...linked }], context()))).toBe(
      'FLOOR_ZONE_RESOURCE_TAKEN',
    );
  });

  it('rejects a resource already linked in another plan', () => {
    const zones = [zone({ kind: 'ROOM', isReservable: true, resourceId: 'room' })];

    expect(
      codeOf(() => assertValidZones(zones, context({ linkedElsewhere: new Set(['room']) }))),
    ).toBe('FLOOR_ZONE_RESOURCE_TAKEN');
  });
});

describe('linkedResourceIds', () => {
  it('returns each linked resource once', () => {
    const zones = [zone({ resourceId: 'room' }), zone({ resourceId: 'room' }), zone()];

    expect(linkedResourceIds(zones)).toEqual(['room']);
  });
});
