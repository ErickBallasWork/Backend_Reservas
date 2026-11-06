import type { ResourceType } from '../common/constants';
import { RuleViolation } from './time-rules';

export function resolveAttendees(
  type: ResourceType,
  attendees: number | undefined,
  capacity: number,
): number | null {
  if (type === 'LAPTOP') return null;
  if (attendees === undefined) {
    throw new RuleViolation('ATTENDEES_REQUIRED', 'Indica cuántas personas asistirán');
  }
  if (attendees > capacity) {
    throw new RuleViolation(
      'ATTENDEES_EXCEEDS_CAPACITY',
      `Los asistentes no pueden superar la capacidad del recurso (${capacity})`,
    );
  }
  return attendees;
}
