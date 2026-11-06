import { ReservationRulesService } from './reservation-rules.service';

describe('ReservationRulesService', () => {
  const service = new ReservationRulesService();

  it('uses 30 minute slots', () => {
    expect(service.current().slotMinutes).toBe(30);
  });

  it('requires 24 hours in advance to book and to cancel (RF-05)', () => {
    const { minAdvanceHours, cancelMinHours } = service.current();

    expect(minAdvanceHours).toBe(24);
    expect(cancelMinHours).toBe(24);
  });

  it('limits a reservation to 48 continuous hours (RF-06)', () => {
    expect(service.current().maxDurationHours).toBe(48);
  });

  it('opens the check-in window 15 minutes before and closes it 15 minutes after the start', () => {
    const { checkinBeforeMin, checkinAfterMin } = service.current();

    expect(checkinBeforeMin).toBe(15);
    expect(checkinAfterMin).toBe(15);
  });

  it('sends the reminder one hour before the start (Q-06)', () => {
    expect(service.current().reminderLeadMin).toBe(60);
  });

  it('returns a copy so callers cannot change the shared rules', () => {
    service.current().minAdvanceHours = 0;

    expect(service.current().minAdvanceHours).toBe(24);
  });
});
