import { assertDecidable, assertRejectionHasComments, normalizeComments } from './approval-rules';

const NOW = new Date('2026-11-10T12:00:00Z');
const FUTURE = new Date('2026-11-12T12:00:00Z');

function codeOf(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return (error as { response: { code: string } }).response.code;
  }
  return null;
}

describe('normalizeComments', () => {
  it('trims and turns blank text into null', () => {
    expect(normalizeComments('  motivo  ')).toBe('motivo');
    expect(normalizeComments('   ')).toBeNull();
    expect(normalizeComments(undefined)).toBeNull();
  });
});

describe('assertRejectionHasComments', () => {
  it('requires a comment to reject', () => {
    expect(codeOf(() => assertRejectionHasComments(false, null))).toBe('COMMENTS_REQUIRED');
  });

  it('does not require a comment to approve', () => {
    expect(codeOf(() => assertRejectionHasComments(true, null))).toBeNull();
  });

  it('accepts a rejection with a comment', () => {
    expect(codeOf(() => assertRejectionHasComments(false, 'sin cupo'))).toBeNull();
  });
});

describe('assertDecidable', () => {
  it('accepts a pending reservation that has not started', () => {
    expect(
      codeOf(() => assertDecidable({ status: 'PENDING_APPROVAL', startDateTime: FUTURE }, NOW)),
    ).toBeNull();
  });

  it.each(['CONFIRMED', 'REJECTED', 'CANCELLED'])('refuses a %s reservation', (status) => {
    expect(codeOf(() => assertDecidable({ status, startDateTime: FUTURE }, NOW))).toBe(
      'NOT_PENDING',
    );
  });

  it('refuses a pending reservation that already started', () => {
    expect(
      codeOf(() =>
        assertDecidable({ status: 'PENDING_APPROVAL', startDateTime: new Date(NOW) }, NOW),
      ),
    ).toBe('ALREADY_STARTED');
  });
});
