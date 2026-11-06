import {
  cooldownEndsAt,
  emailDomain,
  isAllowedDomain,
  isBootstrapWindowOpen,
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

describe('isBootstrapWindowOpen', () => {
  const createdAt = new Date('2026-11-06T10:00:00Z');

  it('is open up to 24 hours after the user was created', () => {
    expect(isBootstrapWindowOpen(createdAt, new Date('2026-11-07T10:00:00Z'))).toBe(true);
  });

  it('is closed after 24 hours', () => {
    expect(isBootstrapWindowOpen(createdAt, new Date('2026-11-07T10:00:01Z'))).toBe(false);
  });

  it('is closed for a creation date in the future', () => {
    expect(isBootstrapWindowOpen(createdAt, new Date('2026-11-06T09:00:00Z'))).toBe(false);
  });
});
