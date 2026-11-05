import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Un servicio puede trabajar con la conexión normal o dentro de una transacción.
export type Db = PrismaService | Prisma.TransactionClient;

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
