import { PrismaClient } from '@prisma/client';
import { approveSuperadminRequest } from '../src/access-requests/bootstrap-approval';
import { loadEnvFileIfPresent } from './seed-environment';

loadEnvFileIfPresent();
const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: npm run access:approve -- <email>');
  const { requestId } = await approveSuperadminRequest(prisma, email);
  console.log(`Approved request ${requestId} for ${email}. Open /login on that browser.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
