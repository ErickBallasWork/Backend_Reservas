import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import {
  PURPOSES,
  RESERVATION_STATUSES,
  type Purpose,
  type ReservationStatus,
} from '../../common/constants';

export class SpocAgendaQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Building to show. The first one assigned is used when omitted',
  })
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @ApiProperty({ description: 'Range start (ISO 8601)', example: '2026-11-12T05:00:00Z' })
  @IsDateString()
  from!: string;

  @ApiProperty({ description: 'Range end (ISO 8601), exclusive', example: '2026-11-13T05:00:00Z' })
  @IsDateString()
  to!: string;
}

export class AgendaRoomDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  capacity!: number;
}

export class AgendaBuildingDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [AgendaRoomDto], description: 'Active meeting rooms' })
  rooms!: AgendaRoomDto[];
}

export class AgendaOwnerDto {
  @ApiProperty()
  fullName!: string;
}

export class AgendaReservationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  resourceId!: string;

  @ApiProperty({ format: 'date-time' })
  startDateTime!: Date;

  @ApiProperty({ format: 'date-time' })
  endDateTime!: Date;

  @ApiProperty({ enum: RESERVATION_STATUSES, enumName: 'ReservationStatus' })
  status!: ReservationStatus;

  @ApiProperty({ enum: PURPOSES, enumName: 'ReservationPurpose' })
  purpose!: Purpose;

  @ApiProperty()
  justification!: string;

  @ApiProperty({ type: Number, nullable: true })
  attendees!: number | null;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  seriesId!: string | null;

  @ApiProperty({ description: 'True when a SPOC already moved this reservation' })
  reallocated!: boolean;

  @ApiProperty({ type: AgendaOwnerDto })
  owner!: AgendaOwnerDto;
}

export class SpocAgendaResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Building whose reservations are listed' })
  buildingId!: string;

  @ApiProperty({
    type: [AgendaBuildingDto],
    description: 'Buildings the user manages, with their rooms',
  })
  buildings!: AgendaBuildingDto[];

  @ApiProperty({ type: [AgendaReservationDto] })
  reservations!: AgendaReservationDto[];
}
