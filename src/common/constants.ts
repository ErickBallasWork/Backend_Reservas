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

export const APPROVAL_DECISIONS = ['APPROVE', 'REJECT'] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const RESOURCE_TYPES = ['MEETING_ROOM', 'AI_LAB', 'LAPTOP'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESERVATION_TYPE_BY_RESOURCE: Record<ResourceType, string> = {
  MEETING_ROOM: 'ROOM',
  AI_LAB: 'FULL_LAB',
  LAPTOP: 'LAPTOP',
};

export const RESERVATION_TYPES = ['ROOM', 'FULL_LAB', 'LAPTOP'] as const;
export type ReservationType = (typeof RESERVATION_TYPES)[number];

export const PURPOSES = ['INTERNAL_MEETING', 'CLIENT_MEETING', 'TRAINING'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const RESERVATION_STATUSES = [
  'PENDING_APPROVAL',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'CHECKED_IN',
  'NO_SHOW',
  'TRANSFERRED',
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const Status = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  CHECKED_IN: 'CHECKED_IN',
  NO_SHOW: 'NO_SHOW',
  TRANSFERRED: 'TRANSFERRED',
} as const;

export const TRANSFER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type TransferStatusValue = (typeof TRANSFER_STATUSES)[number];

export const TransferStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
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
export const BOOTSTRAP_AUTO_APPROVE_WINDOW_HOURS = 24;

export const SANCTION_STATUSES = ['ACTIVE', 'RESOLVED'] as const;
export type SanctionStatus = (typeof SANCTION_STATUSES)[number];

export const SANCTION_TYPES = ['NO_SHOW'] as const;
export type SanctionType = (typeof SANCTION_TYPES)[number];

export const CHECK_IN_METHODS = ['BUTTON', 'QR'] as const;

export const NOTIFICATION_TYPES = [
  'ACCESS_REQUEST',
  'APPROVAL_REALLOCATED',
  'APPROVAL_REQUESTED',
  'NO_SHOW_NO_SANCTION',
  'NO_SHOW_SANCTION',
  'RESERVATION_APPROVED',
  'RESERVATION_CONFIRMED',
  'RESERVATION_PENDING',
  'RESERVATION_REALLOCATED',
  'RESERVATION_REJECTED',
  'RESERVATION_REMINDER',
  'RESERVATION_UPDATED',
  'SANCTION_RESOLVED',
  'TRAINING_EXPIRED',
  'TRANSFER_ACCEPTED',
  'TRANSFER_CANCELLED',
  'TRANSFER_EXPIRED',
  'TRANSFER_REJECTED',
  'TRANSFER_REQUESTED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const FLOOR_ZONE_KINDS = ['ROOM', 'LAB', 'DECORATIVE', 'LABEL'] as const;
export type FloorZoneKind = (typeof FLOOR_ZONE_KINDS)[number];

export const FLOOR_RESOURCE_TYPES = ['MEETING_ROOM', 'AI_LAB'] as const;
export type FloorResourceType = (typeof FLOOR_RESOURCE_TYPES)[number];

export const RESOURCE_TYPE_BY_ZONE_KIND: Partial<Record<FloorZoneKind, FloorResourceType>> = {
  ROOM: 'MEETING_ROOM',
  LAB: 'AI_LAB',
};

export const FLOOR_STATES = [
  'FREE',
  'OCCUPIED',
  'MINE',
  'OUT_OF_FILTER',
  'NOT_RESERVABLE',
] as const;
export type FloorState = (typeof FLOOR_STATES)[number];

export const FLOOR_STATE_REASONS = ['TYPE', 'CAPACITY', 'CLOSED', 'INACTIVE'] as const;
export type FloorStateReason = (typeof FLOOR_STATE_REASONS)[number];
