import { Prisma } from '@prisma/client';
import { type PrismaService } from '../prisma/prisma.service';

export type Db = PrismaService | Prisma.TransactionClient;

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
