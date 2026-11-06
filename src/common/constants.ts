export const ROLES = [
  'ASOCIADO',
  'ADMIN',
  'SPOC_ADMIN',
  'LIDER',
  'SPOC_EDIFICIO',
  'SUPERADMIN',
] as const;
export type Role = (typeof ROLES)[number];

export const SUPERADMIN_ROLE: Role = 'SUPERADMIN';
export const MANAGER_ROLES: readonly string[] = ['SPOC_ADMIN', 'LIDER'];
export const PRIVILEGED_ROLES: readonly string[] = ['ADMIN', SUPERADMIN_ROLE];

export const RESOURCE_TYPES = ['MEETING_ROOM', 'AI_LAB', 'LAPTOP'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESERVATION_TYPE_BY_RESOURCE: Record<ResourceType, string> = {
  MEETING_ROOM: 'ROOM',
  AI_LAB: 'FULL_LAB',
  LAPTOP: 'LAPTOP',
};

export const PURPOSES = ['INTERNAL_MEETING', 'CLIENT_MEETING', 'TRAINING'] as const;

export const RESERVATION_STATUSES = [
  'PENDING_APPROVAL',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'CHECKED_IN',
  'NO_SHOW',
] as const;

export const Status = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  CHECKED_IN: 'CHECKED_IN',
  NO_SHOW: 'NO_SHOW',
} as const;

export const BLOCKING_STATUSES: string[] = [
  Status.PENDING_APPROVAL,
  Status.CONFIRMED,
  Status.CHECKED_IN,
];

export const ACCESS_REQUEST_KINDS = ['NEW_USER', 'NEW_DEVICE'] as const;
export type AccessRequestKind = (typeof ACCESS_REQUEST_KINDS)[number];

export const ACCESS_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

export const ACCESS_REQUEST_COOLDOWN_DAYS = 7;

export const SANCTION_STATUSES = ['ACTIVE', 'RESOLVED'] as const;

export const CHECK_IN_METHODS = ['BUTTON', 'QR'] as const;
