import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const SECRET_BYTES = 48;

export function generateSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function matchesSecretHash(secret: string, storedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret));
  const expected = Buffer.from(storedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
