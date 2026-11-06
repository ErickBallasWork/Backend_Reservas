import {
  cooldownEndsAt,
  emailDomain,
  hashDeviceSecret,
  isAllowedDomain,
  matchesDeviceSecret,
} from './access-request.rules';

const DOMAINS = ['tcs.com', 'pichincha.com'];

describe('isAllowedDomain', () => {
  it.each(['ana@tcs.com', 'luis@pichincha.com'])('accepts %s', (email) => {
    expect(isAllowedDomain(email, DOMAINS)).toBe(true);
  });

  it.each(['ana@gmail.com', 'ana@tcs.com.evil.io', 'ana@sub.tcs.com', 'ana@xtcs.com'])(
    'rejects %s',
    (email) => {
      expect(isAllowedDomain(email, DOMAINS)).toBe(false);
    },
  );

  it('reads the domain after the last @', () => {
    expect(emailDomain('"a@tcs.com"@evil.io')).toBe('evil.io');
  });
});

describe('cooldownEndsAt', () => {
  it('adds seven days to the rejection', () => {
    const rejectedAt = new Date('2026-11-01T10:00:00Z');

    expect(cooldownEndsAt(rejectedAt).toISOString()).toBe('2026-11-08T10:00:00.000Z');
  });
});

describe('device secret', () => {
  const secret = 'a'.repeat(43);

  it('matches the secret it was hashed from', () => {
    expect(matchesDeviceSecret(secret, hashDeviceSecret(secret))).toBe(true);
  });

  it('does not match another secret', () => {
    expect(matchesDeviceSecret('b'.repeat(43), hashDeviceSecret(secret))).toBe(false);
  });

  it('does not match a malformed stored hash', () => {
    expect(matchesDeviceSecret(secret, 'short')).toBe(false);
  });

  it('never stores the secret itself', () => {
    expect(hashDeviceSecret(secret)).not.toContain(secret);
  });
});
