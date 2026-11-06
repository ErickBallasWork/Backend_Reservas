import { PrismaClient } from '@prisma/client';
import { ROLES } from '../src/common/constants';
import { readSeedEnvironment } from './seed-environment';

const { initialSuperadmin } = readSeedEnvironment();
const prisma = new PrismaClient();

async function main() {
  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  if (!initialSuperadmin) {
    console.warn('Roles ready. INITIAL_SUPERADMIN_EMAIL is not set, so no SUPERADMIN was created.');
    return;
  }
  const { email, fullName } = initialSuperadmin;

  const superadmin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName },
  });
  const superadminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPERADMIN' } });
  const isAlreadySuperadmin = await prisma.userRole.findFirst({
    where: { userId: superadmin.id, roleId: superadminRole.id },
  });
  if (!isAlreadySuperadmin) {
    await prisma.userRole.create({ data: { userId: superadmin.id, roleId: superadminRole.id } });
  }
  console.log(`Roles ready. Initial SUPERADMIN: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
