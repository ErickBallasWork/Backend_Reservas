import { ApiProperty } from '@nestjs/swagger';
import { NamedReferenceDto } from '../../catalog/dto/catalog-response.dto';
import {
  PURPOSES,
  RESERVATION_STATUSES,
  RESOURCE_TYPES,
  TRANSFER_STATUSES,
  type Purpose,
  type ReservationStatus,
  type ResourceType,
  type TransferStatusValue,
} from '../../common/constants';
import { ReservationOwnerDto } from '../../reservations/dto/reservation-response.dto';

export class TransferRequesterDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  department!: string | null;
}

export class TransferResourceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RESOURCE_TYPES, enumName: 'ResourceType' })
  type!: ResourceType;

  @ApiProperty({ type: NamedReferenceDto })
  building!: NamedReferenceDto;
}

export class TransferReservationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: PURPOSES, enumName: 'ReservationPurpose' })
  purpose!: Purpose;

  @ApiProperty({ format: 'date-time' })
  startDateTime!: Date;

  @ApiProperty({ format: 'date-time' })
  endDateTime!: Date;

  @ApiProperty({ enum: RESERVATION_STATUSES, enumName: 'ReservationStatus' })
  status!: ReservationStatus;

  @ApiProperty({ type: TransferResourceDto })
  resource!: TransferResourceDto;

  @ApiProperty({
    type: ReservationOwnerDto,
    nullable: true,
    description: 'Owner of the reservation. Hidden from the requester until the owner answers',
  })
  user!: ReservationOwnerDto | null;
}

export class TransferRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  reservationId!: string;

  @ApiProperty({ format: 'uuid' })
  requesterId!: string;

  @ApiProperty({ enum: PURPOSES, enumName: 'ReservationPurpose' })
  purpose!: Purpose;

  @ApiProperty({ description: 'Why the requester needs the resource' })
  justification!: string;

  @ApiProperty({ type: Number, nullable: true })
  attendees!: number | null;

  @ApiProperty({ enum: TRANSFER_STATUSES, enumName: 'TransferStatus' })
  status!: TransferStatusValue;

  @ApiProperty({ type: String, nullable: true, description: 'Answer of the owner' })
  responseComment!: string | null;

  @ApiProperty({ type: Date, format: 'date-time', nullable: true })
  respondedAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Reservation created for the requester when the owner accepted',
  })
  newReservationId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: TransferRequesterDto })
  requester!: TransferRequesterDto;

  @ApiProperty({ type: TransferReservationDto })
  reservation!: TransferReservationDto;
}

export class TransferRequestPageResponseDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty({ type: [TransferRequestResponseDto] })
  items!: TransferRequestResponseDto[];
}
