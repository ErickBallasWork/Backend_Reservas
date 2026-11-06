import { PrismaClient } from '@prisma/client';
import { BLOCKING_STATUSES, ROLES } from '../src/common/constants';
import { readSeedEnvironment } from './seed-environment';
import { AMAZONAS_PLAZA, seedFloorPlans } from './seed-floor-plans';

if (readSeedEnvironment().isProduction) {
  throw new Error('The demo seed never runs in production. Use "npm run db:seed".');
}

const prisma = new PrismaClient();

const LEGACY_DEMO_BUILDINGS = ['Edificio Quito Norte', 'Edificio Guayaquil Centro'];

async function deactivateLegacyBuildings() {
  const legacy = await prisma.building.findMany({
    where: { name: { in: LEGACY_DEMO_BUILDINGS }, isActive: true },
    select: { id: true, name: true },
  });
  for (const building of legacy) {
    const futureReservations = await prisma.reservation.count({
      where: {
        resource: { buildingId: building.id },
        status: { in: BLOCKING_STATUSES },
        endDateTime: { gt: new Date() },
      },
    });
    await prisma.resource.updateMany({
      where: { buildingId: building.id },
      data: { isActive: false },
    });
    await prisma.building.update({ where: { id: building.id }, data: { isActive: false } });
    console.warn(
      `${building.name} and its resources were deactivated. Future blocking reservations on them: ${futureReservations}.`,
    );
  }
}

async function main() {
  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  const roleIds = new Map<string, number>(
    (await prisma.role.findMany()).map((r) => [r.name, r.id]),
  );

  const buildingIds = await seedFloorPlans(prisma);
  const spocBuildingId = buildingIds.get(AMAZONAS_PLAZA) ?? null;
  await deactivateLegacyBuildings();

  const users = [
    {
      email: 'ana.asociado@demo.com',
      fullName: 'Ana Asociado',
      department: 'Desarrollo',
      roles: ['ASOCIADO'],
    },
    {
      email: 'luis.lider@demo.com',
      fullName: 'Luis Líder de Conocimiento',
      department: 'Conocimiento',
      roles: ['ASOCIADO', 'LIDER'],
    },
    {
      email: 'sofia.spocadmin@demo.com',
      fullName: 'Sofía SPOC Administrativo',
      department: 'Administración',
      roles: ['ASOCIADO', 'SPOC_ADMIN'],
    },
    {
      email: 'carlos.spoc@demo.com',
      fullName: 'Carlos SPOC de Edificio',
      department: 'Facilities',
      roles: ['ASOCIADO', 'SPOC_EDIFICIO'],
    },
    { email: 'admin@demo.com', fullName: 'Administrador Demo', department: 'TI', roles: ['ADMIN'] },
    {
      email: 'superadmin@demo.com',
      fullName: 'Superadministrador Demo',
      department: 'TI',
      roles: ['SUPERADMIN'],
    },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, department: u.department },
      create: { email: u.email, fullName: u.fullName, department: u.department },
    });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.createMany({
      data: u.roles.map((role) => ({
        userId: user.id,
        roleId: roleIds.get(role)!,
        buildingId: role === 'SPOC_EDIFICIO' ? spocBuildingId : null,
      })),
    });
  }

  console.log('Demo data ready: 6 roles, the floor plan buildings and 6 demo users.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
