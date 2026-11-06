import { generateSecret, hashSecret, matchesSecretHash } from './secret-hash';

describe('secret hashing', () => {
  const secret = 'a'.repeat(43);

  it('matches the secret it was hashed from', () => {
    expect(matchesSecretHash(secret, hashSecret(secret))).toBe(true);
  });

  it('does not match another secret', () => {
    expect(matchesSecretHash('b'.repeat(43), hashSecret(secret))).toBe(false);
  });

  it('does not match a malformed stored hash', () => {
    expect(matchesSecretHash(secret, 'short')).toBe(false);
  });

  it('never stores the secret itself', () => {
    expect(hashSecret(secret)).not.toContain(secret);
  });

  it('generates url safe secrets that differ every time', () => {
    const first = generateSecret();

    expect(first).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(generateSecret()).not.toBe(first);
  });
});
