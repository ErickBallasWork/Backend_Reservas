import { Injectable } from '@nestjs/common';

export interface ReservationRules {
  slotMinutes: number;
  minAdvanceHours: number;
  maxDurationHours: number;
  cancelMinHours: number;
  checkinBeforeMin: number;
  checkinAfterMin: number;
  reminderLeadMin: number;
}

export const DEFAULT_RESERVATION_RULES: Readonly<ReservationRules> = Object.freeze({
  slotMinutes: 30,
  minAdvanceHours: 24,
  maxDurationHours: 48,
  cancelMinHours: 24,
  checkinBeforeMin: 15,
  checkinAfterMin: 15,
  reminderLeadMin: 60,
});

@Injectable()
export class ReservationRulesService {
  current(): ReservationRules {
    return { ...DEFAULT_RESERVATION_RULES };
  }
}
