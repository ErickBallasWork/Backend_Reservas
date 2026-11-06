import { cooldownEndsAt, emailDomain, isAllowedDomain } from './access-request.rules';

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
