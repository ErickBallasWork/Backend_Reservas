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
    console.warn(
      'Roles listos. Falta INITIAL_ADMIN_EMAIL en el .env: no se creó el Administrador.',
    );
    return;
  }
  const { email, fullName } = initialAdmin;

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const yaEsAdmin = await prisma.userRole.findFirst({
    where: { userId: admin.id, roleId: adminRole.id },
  });
  if (!yaEsAdmin) {
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
  }
  console.log(`Roles listos. Administrador inicial: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
