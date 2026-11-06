import { PrismaClient } from '@prisma/client';
import { ROLES } from '../src/common/constants';
import { readSeedEnvironment } from './seed-environment';

if (readSeedEnvironment().isProduction) {
  throw new Error('The demo seed never runs in production. Use "npm run db:seed".');
}

const prisma = new PrismaClient();

async function upsertResource(data: {
  buildingId: string;
  type: 'MEETING_ROOM' | 'AI_LAB' | 'LAPTOP';
  name: string;
  capacity?: number;
  equipment?: string;
  parentResourceId?: string;
  assetTag?: string;
}) {
  return prisma.resource.upsert({
    where: { buildingId_name: { buildingId: data.buildingId, name: data.name } },
    update: {},
    create: data,
  });
}

async function main() {
  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  const roleIds = new Map<string, number>(
    (await prisma.role.findMany()).map((r) => [r.name, r.id]),
  );

  const quito = await prisma.building.upsert({
    where: { name: 'Edificio Quito Norte' },
    update: {},
    create: { name: 'Edificio Quito Norte', address: 'Av. Amazonas y Naciones Unidas, Quito' },
  });
  const guayaquil = await prisma.building.upsert({
    where: { name: 'Edificio Guayaquil Centro' },
    update: {},
    create: { name: 'Edificio Guayaquil Centro', address: 'Av. 9 de Octubre, Guayaquil' },
  });

  await upsertResource({
    buildingId: quito.id,
    type: 'MEETING_ROOM',
    name: 'Sala Pichincha',
    capacity: 8,
    equipment: 'Pantalla, pizarra',
  });
  await upsertResource({
    buildingId: quito.id,
    type: 'MEETING_ROOM',
    name: 'Sala Cotopaxi',
    capacity: 12,
    equipment: 'Proyector, videoconferencia',
  });
  await upsertResource({
    buildingId: quito.id,
    type: 'MEETING_ROOM',
    name: 'Sala Chimborazo',
    capacity: 6,
    equipment: 'Pantalla',
  });
  await upsertResource({
    buildingId: guayaquil.id,
    type: 'MEETING_ROOM',
    name: 'Sala Malecón',
    capacity: 10,
    equipment: 'Proyector',
  });

  const lab = await upsertResource({
    buildingId: quito.id,
    type: 'AI_LAB',
    name: 'Laboratorio IA 1',
    capacity: 10,
    equipment: 'Laptops con GPU, pantalla grande',
  });
  for (let i = 1; i <= 5; i++) {
    const code = `LAP-IA-0${i}`;
    await upsertResource({
      buildingId: quito.id,
      type: 'LAPTOP',
      name: code,
      capacity: 1,
      equipment: 'Core i7, 32 GB RAM, GPU RTX 4060',
      parentResourceId: lab.id,
      assetTag: `TCS-${code}`,
    });
  }

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
        buildingId: role === 'SPOC_EDIFICIO' ? quito.id : null,
      })),
    });
  }

  console.log(
    'Demo data ready: 6 roles, 2 buildings, 4 rooms, 1 lab with 5 laptops and 6 demo users.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
