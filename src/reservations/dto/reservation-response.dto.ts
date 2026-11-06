import { ApiProperty } from '@nestjs/swagger';
import { NamedReferenceDto } from '../../catalog/dto/catalog-response.dto';
import {
  CHECK_IN_METHODS,
  PURPOSES,
  RESERVATION_STATUSES,
  RESERVATION_TYPES,
  RESOURCE_TYPES,
  type Purpose,
  type ReservationStatus,
  type ReservationType,
  type ResourceType,
} from '../../common/constants';

export class ReservationResourceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RESOURCE_TYPES, enumName: 'ResourceType' })
  type!: ResourceType;

  @ApiProperty({ type: NamedReferenceDto })
  building!: NamedReferenceDto;

  @ApiProperty({ type: NamedReferenceDto, nullable: true })
  parent!: NamedReferenceDto | null;
}

export class ReservationOwnerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;
}

export class CheckInResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  reservationId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'date-time' })
  checkInDate!: Date;

  @ApiProperty({ enum: CHECK_IN_METHODS, enumName: 'CheckInMethod' })
  method!: string;
}

export class ApprovalApproverDto {
  @ApiProperty()
  fullName!: string;
}

export class ReservationApprovalDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  reservationId!: string;

  @ApiProperty({ format: 'uuid' })
  approverId!: string;

  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  status!: string;

  @ApiProperty({ type: String, nullable: true })
  comments!: string | null;

  @ApiProperty({ format: 'date-time' })
  decisionDate!: Date;

  @ApiProperty({ type: ApprovalApproverDto })
  approver!: ApprovalApproverDto;
}

export class ReservationReallocationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  reservationId!: string;

  @ApiProperty({ format: 'uuid' })
  previousResourceId!: string;

  @ApiProperty({ format: 'uuid' })
  newResourceId!: string;

  @ApiProperty({ format: 'uuid' })
  responsibleUserId!: string;

  @ApiProperty({ format: 'date-time' })
  previousStartDateTime!: Date;

  @ApiProperty({ format: 'date-time' })
  previousEndDateTime!: Date;

  @ApiProperty({ format: 'date-time' })
  newStartDateTime!: Date;

  @ApiProperty({ format: 'date-time' })
  newEndDateTime!: Date;

  @ApiProperty()
  justification!: string;

  @ApiProperty({ format: 'date-time' })
  reallocationDate!: Date;
}

export class ReservationSeriesRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Reservations of the series' })
  occurrenceCount!: number;
}

export class ReservationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  resourceId!: string;

  @ApiProperty({ enum: RESERVATION_TYPES, enumName: 'ReservationType' })
  reservationType!: ReservationType;

  @ApiProperty({ enum: PURPOSES, enumName: 'ReservationPurpose' })
  purpose!: Purpose;

  @ApiProperty()
  justification!: string;

  @ApiProperty({ type: Number, nullable: true })
  attendees!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Position inside its series' })
  occurrenceIndex!: number | null;

  @ApiProperty({ type: ReservationSeriesRefDto, nullable: true })
  series!: ReservationSeriesRefDto | null;

  @ApiProperty({ format: 'date-time' })
  startDateTime!: Date;

  @ApiProperty({ format: 'date-time' })
  endDateTime!: Date;

  @ApiProperty({ enum: RESERVATION_STATUSES, enumName: 'ReservationStatus' })
  status!: ReservationStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: ReservationResourceDto })
  resource!: ReservationResourceDto;

  @ApiProperty({ type: ReservationOwnerDto })
  user!: ReservationOwnerDto;

  @ApiProperty({ type: CheckInResponseDto, nullable: true })
  checkIn!: CheckInResponseDto | null;
}

export class ReservationDetailResponseDto extends ReservationResponseDto {
  @ApiProperty({ type: [ReservationApprovalDto] })
  approvals!: ReservationApprovalDto[];

  @ApiProperty({ type: [ReservationReallocationDto] })
  reallocations!: ReservationReallocationDto[];
}

export class ReservationPageResponseDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty({ type: [ReservationResponseDto] })
  items!: ReservationResponseDto[];
}
