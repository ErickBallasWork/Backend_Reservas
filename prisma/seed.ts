// Datos iniciales OBLIGATORIOS (también en producción): roles y Administrador inicial.
// El catálogo (edificio, laboratorios, laptops, salas) lo registra el Administrador desde la app.
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile();
} catch {
  // sin .env (en Azure las variables vienen del entorno)
}

const prisma = new PrismaClient();
const ROLES = ['ASOCIADO', 'ADMIN', 'SPOC_ADMIN', 'LIDER', 'SPOC_EDIFICIO'];

async function main() {
  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.warn(
      'Roles listos. Falta INITIAL_ADMIN_EMAIL en el .env: no se creó el Administrador.',
    );
    return;
  }
  const fullName = process.env.INITIAL_ADMIN_NAME?.trim() || email;

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
