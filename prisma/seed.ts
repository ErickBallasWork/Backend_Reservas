import { PrismaClient } from '@prisma/client';
import { ROLES } from '../src/common/constants';
import { readSeedEnvironment } from './seed-environment';

const { initialAdmin } = readSeedEnvironment();
const prisma = new PrismaClient();

async function main() {
  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  if (!initialAdmin) {
    console.warn('Roles ready. INITIAL_ADMIN_EMAIL is not set, so no administrator was created.');
    return;
  }
  const { email, fullName } = initialAdmin;

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const isAlreadyAdmin = await prisma.userRole.findFirst({
    where: { userId: admin.id, roleId: adminRole.id },
  });
  if (!isAlreadyAdmin) {
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
  }
  console.log(`Roles ready. Initial administrator: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
