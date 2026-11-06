import { ApiProperty } from '@nestjs/swagger';
import {
  SANCTION_STATUSES,
  SANCTION_TYPES,
  type SanctionStatus,
  type SanctionType,
} from '../../common/constants';
import { ReservationOwnerDto } from '../../reservations/dto/reservation-response.dto';

export class SanctionResolverDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;
}

export class SanctionReservationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  startDateTime!: Date;

  @ApiProperty({ format: 'date-time' })
  endDateTime!: Date;

  @ApiProperty({ description: 'Name of the reserved resource' })
  resourceName!: string;
}

export class SanctionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: SANCTION_TYPES, enumName: 'SanctionType' })
  type!: SanctionType;

  @ApiProperty({ enum: SANCTION_STATUSES, enumName: 'SanctionStatus' })
  status!: SanctionStatus;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ format: 'date-time' })
  startDate!: Date;

  @ApiProperty({ format: 'date-time', nullable: true })
  endDate!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  resolvedAt!: Date | null;

  @ApiProperty({ nullable: true, description: 'Reason given by the administrator on resolving' })
  resolutionComment!: string | null;

  @ApiProperty({ type: ReservationOwnerDto })
  user!: ReservationOwnerDto;

  @ApiProperty({ type: SanctionResolverDto, nullable: true })
  resolvedBy!: SanctionResolverDto | null;

  @ApiProperty({ type: SanctionReservationDto })
  reservation!: SanctionReservationDto;
}

export class SanctionPageResponseDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty({ type: [SanctionResponseDto] })
  items!: SanctionResponseDto[];
}

export class ProcessNoShowsResponseDto {
  @ApiProperty({ description: 'Reservations marked as no-show in this run' })
  noShows!: number;

  @ApiProperty({ description: 'Pending trainings rejected because they started undecided' })
  expiredTrainings!: number;

  @ApiProperty({ description: 'Pending transfer requests closed because the reservation started' })
  expiredTransfers!: number;
}
