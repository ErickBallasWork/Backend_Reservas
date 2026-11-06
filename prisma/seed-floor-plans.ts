import { type PrismaClient } from '@prisma/client';
import { type FloorZoneKind, type ResourceType } from '../src/common/constants';
import { assertZonesFit } from '../src/floor-plans/floor-zone.rules';

interface SeedResource {
  type: Exclude<ResourceType, 'LAPTOP'>;
  name: string;
  capacity: number;
  laptops?: { prefix: string; count: number };
}

interface SeedZone {
  name: string;
  kind: FloorZoneKind;
  x: number;
  y: number;
  width: number;
  height: number;
  resource?: string;
}

interface SeedBuilding {
  name: string;
  address: string;
  resources: SeedResource[];
  plan: { name: string; width: number; height: number; zones: SeedZone[] };
}

export const AMAZONAS_PLAZA = 'Amazonas Plaza';
export const TORRES_DEL_CASTILLO = 'Torres del Castillo';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const BUILDINGS: SeedBuilding[] = [
  {
    name: AMAZONAS_PLAZA,
    address: 'Av. Amazonas, Quito',
    resources: [
      { type: 'MEETING_ROOM', name: 'Sala Board', capacity: 12 },
      {
        type: 'AI_LAB',
        name: 'Laboratorio IA',
        capacity: 8,
        laptops: { prefix: 'AMZ-LAP-', count: 8 },
      },
    ],
    plan: {
      name: 'Planta principal',
      width: 900,
      height: 600,
      zones: [
        { name: 'SC1', kind: 'ROOM', ...box(20, 40, 100, 60) },
        { name: 'SC2', kind: 'ROOM', ...box(120, 40, 100, 60) },
        { name: 'Command Center', kind: 'ROOM', ...box(20, 100, 200, 480) },
        { name: 'Board', kind: 'ROOM', ...box(280, 40, 260, 72), resource: 'Sala Board' },
        { name: 'IA Lab', kind: 'LAB', ...box(280, 140, 260, 200), resource: 'Laboratorio IA' },
        { name: 'Baños', kind: 'DECORATIVE', ...box(280, 380, 260, 72) },
        { name: 'Cafetería', kind: 'DECORATIVE', ...box(280, 472, 260, 108) },
        { name: 'C1', kind: 'ROOM', ...box(560, 40, 100, 72) },
        { name: 'C2', kind: 'ROOM', ...box(660, 40, 100, 72) },
        { name: 'C3', kind: 'ROOM', ...box(760, 40, 100, 72) },
        { name: 'SM', kind: 'ROOM', ...box(760, 208, 100, 272) },
      ],
    },
  },
  {
    name: TORRES_DEL_CASTILLO,
    address: 'Torres del Castillo, Quito',
    resources: [
      { type: 'MEETING_ROOM', name: 'Sala Board', capacity: 14 },
      { type: 'MEETING_ROOM', name: 'Soporte', capacity: 6 },
    ],
    plan: {
      name: 'Planta principal',
      width: 1080,
      height: 810,
      zones: [
        { name: 'BP', kind: 'DECORATIVE', ...box(20, 50, 170, 300) },
        { name: 'Cafetería', kind: 'DECORATIVE', ...box(200, 50, 330, 120) },
        { name: 'Board', kind: 'ROOM', ...box(544, 50, 270, 126), resource: 'Sala Board' },
        { name: 'OFI', kind: 'DECORATIVE', ...box(824, 104, 50, 100) },
        { name: 'Produ', kind: 'DECORATIVE', ...box(892, 50, 156, 156) },
        { name: 'Guardia', kind: 'DECORATIVE', ...box(410, 250, 260, 90) },
        { name: 'RH', kind: 'DECORATIVE', ...box(20, 390, 170, 180) },
        { name: 'Soporte', kind: 'ROOM', ...box(20, 580, 170, 200), resource: 'Soporte' },
        { name: 'Ascensores', kind: 'DECORATIVE', ...box(204, 470, 636, 80) },
        { name: 'Baños', kind: 'DECORATIVE', ...box(204, 566, 304, 220) },
        { name: 'BP', kind: 'DECORATIVE', ...box(534, 566, 516, 220) },
        { name: 'BP', kind: 'DECORATIVE', ...box(866, 324, 184, 236) },
        { name: 'Pasillo', kind: 'LABEL', ...box(440, 200, 120, 30) },
        { name: 'Pasillo', kind: 'LABEL', ...box(230, 200, 120, 30) },
        { name: 'Pasillo', kind: 'LABEL', ...box(700, 400, 120, 30) },
        { name: 'Pasillo', kind: 'LABEL', ...box(440, 420, 120, 30) },
      ],
    },
  },
];

async function upsertResource(
  prisma: PrismaClient,
  data: {
    buildingId: string;
    type: ResourceType;
    name: string;
    capacity: number;
    parentResourceId?: string;
    assetTag?: string;
  },
) {
  return prisma.resource.upsert({
    where: { buildingId_name: { buildingId: data.buildingId, name: data.name } },
    update: {},
    create: data,
  });
}

async function seedResources(prisma: PrismaClient, buildingId: string, resources: SeedResource[]) {
  const linkable = new Map<string, { id: string; isActive: boolean }>();
  for (const { laptops, ...resource } of resources) {
    const created = await upsertResource(prisma, { ...resource, buildingId });
    linkable.set(created.name, created);
    if (!laptops) continue;
    for (let i = 1; i <= laptops.count; i++) {
      const name = `${laptops.prefix}${String(i).padStart(2, '0')}`;
      await upsertResource(prisma, {
        buildingId,
        type: 'LAPTOP',
        name,
        capacity: 1,
        parentResourceId: created.id,
        assetTag: `TCS-${name}`,
      });
    }
  }
  return linkable;
}

async function seedPlan(
  prisma: PrismaClient,
  buildingId: string,
  plan: SeedBuilding['plan'],
  resources: Map<string, { id: string; isActive: boolean }>,
): Promise<boolean> {
  const existing = await prisma.floorPlan.findUnique({
    where: { buildingId_level: { buildingId, level: 0 } },
  });
  if (existing) return false;
  assertZonesFit(plan, plan.zones);

  const linkedIds = new Set(
    (
      await prisma.floorZone.findMany({
        where: { resourceId: { in: [...resources.values()].map((resource) => resource.id) } },
        select: { resourceId: true },
      })
    ).flatMap((zone) => zone.resourceId ?? []),
  );
  const linkFor = (zone: SeedZone) => {
    const resource = zone.resource ? resources.get(zone.resource) : undefined;
    if (!resource) return null;
    if (!resource.isActive || linkedIds.has(resource.id)) {
      console.warn(
        `Zone "${zone.name}" left unlinked: its resource is inactive or already linked.`,
      );
      return null;
    }
    return resource.id;
  };

  await prisma.floorPlan.create({
    data: {
      buildingId,
      level: 0,
      name: plan.name,
      width: plan.width,
      height: plan.height,
      zones: {
        create: plan.zones.map((zone, sortOrder) => {
          const resourceId = linkFor(zone);
          return {
            name: zone.name,
            kind: zone.kind,
            x: zone.x,
            y: zone.y,
            width: zone.width,
            height: zone.height,
            isReservable: resourceId !== null,
            resourceId,
            sortOrder,
          };
        }),
      },
    },
  });
  return true;
}

export async function seedFloorPlans(prisma: PrismaClient): Promise<Map<string, string>> {
  const buildingIds = new Map<string, string>();
  for (const seed of BUILDINGS) {
    const building = await prisma.building.upsert({
      where: { name: seed.name },
      update: {},
      create: { name: seed.name, address: seed.address },
    });
    buildingIds.set(seed.name, building.id);
    const resources = await seedResources(prisma, building.id, seed.resources);
    const created = await seedPlan(prisma, building.id, seed.plan, resources);
    console.log(
      created
        ? `Floor plan of ${seed.name} created with ${seed.plan.zones.length} zones.`
        : `Floor plan of ${seed.name} already exists; left untouched.`,
    );
  }
  return buildingIds;
}
