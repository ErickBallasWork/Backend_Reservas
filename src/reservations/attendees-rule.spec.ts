import { resolveAttendees } from './attendees-rule';
import { RuleViolation } from './time-rules';

function violationCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof RuleViolation ? error.code : undefined;
  }
  return undefined;
}

describe('resolveAttendees', () => {
  it.each(['MEETING_ROOM', 'AI_LAB'] as const)('requires attendees for %s', (type) => {
    expect(violationCode(() => resolveAttendees(type, undefined, 8))).toBe('ATTENDEES_REQUIRED');
  });

  it('accepts attendees up to the capacity, limit included', () => {
    expect(resolveAttendees('MEETING_ROOM', 8, 8)).toBe(8);
    expect(resolveAttendees('AI_LAB', 1, 8)).toBe(1);
  });

  it('rejects attendees above the capacity', () => {
    expect(violationCode(() => resolveAttendees('MEETING_ROOM', 9, 8))).toBe(
      'ATTENDEES_EXCEEDS_CAPACITY',
    );
  });

  it('ignores attendees for a laptop', () => {
    expect(resolveAttendees('LAPTOP', undefined, 1)).toBeNull();
    expect(resolveAttendees('LAPTOP', 5, 1)).toBeNull();
  });
});
