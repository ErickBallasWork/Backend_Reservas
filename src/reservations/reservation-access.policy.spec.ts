import { type CurrentUserData } from '../common/current-user/current-user.types';
import { canViewReservation, type ReservationAccessTarget } from './reservation-access.policy';

const user = (roles: string[], overrides: Partial<CurrentUserData> = {}): CurrentUserData => ({
  id: 'viewer',
  email: 'viewer@tcs.com',
  fullName: 'Viewer',
  roles,
  spocBuildingIds: [],
  ...overrides,
});

const target = (overrides: Partial<ReservationAccessTarget> = {}): ReservationAccessTarget => ({
  userId: 'owner',
  resourceBuildingId: 'building-a',
  ownerIsManagedBy: false,
  ...overrides,
});

describe('canViewReservation', () => {
  it('lets the owner see their own reservation', () => {
    expect(canViewReservation(user(['ASOCIADO']), target({ userId: 'viewer' }))).toBe(true);
  });

  it('hides a reservation from another associate', () => {
    expect(canViewReservation(user(['ASOCIADO']), target())).toBe(false);
  });

  it.each(['ADMIN', 'SUPERADMIN'])('lets %s see any reservation', (role) => {
    expect(canViewReservation(user([role]), target())).toBe(true);
  });

  it('lets a building SPOC see reservations in their own building only', () => {
    const spoc = user(['SPOC_EDIFICIO'], { spocBuildingIds: ['building-a'] });
    expect(canViewReservation(spoc, target())).toBe(true);
    expect(canViewReservation(spoc, target({ resourceBuildingId: 'building-b' }))).toBe(false);
  });

  it('lets an administrative SPOC see only managed associates', () => {
    expect(canViewReservation(user(['SPOC_ADMIN']), target({ ownerIsManagedBy: true }))).toBe(true);
    expect(canViewReservation(user(['SPOC_ADMIN']), target())).toBe(false);
  });

  it('lets a leader see managed associates only, even when the request is pending', () => {
    expect(canViewReservation(user(['LIDER']), target({ ownerIsManagedBy: true }))).toBe(true);
    expect(canViewReservation(user(['LIDER']), target())).toBe(false);
  });
});
