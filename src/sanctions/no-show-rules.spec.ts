import { wasReallocatedWithShortNotice } from './no-show-rules';

const START = new Date('2026-11-11T15:00:00Z');

describe('wasReallocatedWithShortNotice', () => {
  it('is false when the reservation was never reallocated', () => {
    expect(wasReallocatedWithShortNotice(START, undefined)).toBe(false);
  });

  it('is true when the move happened less than 30 minutes before the start', () => {
    expect(wasReallocatedWithShortNotice(START, new Date('2026-11-11T14:31:00Z'))).toBe(true);
  });

  it('is true when the move happened after the start', () => {
    expect(wasReallocatedWithShortNotice(START, new Date('2026-11-11T15:05:00Z'))).toBe(true);
  });

  it('is false at exactly 30 minutes of notice', () => {
    expect(wasReallocatedWithShortNotice(START, new Date('2026-11-11T14:30:00Z'))).toBe(false);
  });

  it('is false when the move happened hours before', () => {
    expect(wasReallocatedWithShortNotice(START, new Date('2026-11-10T09:00:00Z'))).toBe(false);
  });
});
