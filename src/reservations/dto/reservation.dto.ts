import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CHECK_IN_METHODS, PURPOSES, RESERVATION_STATUSES } from '../../common/constants';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class CreateReservationDto {
  /**
   * Id del recurso: una sala (reserva de sala), un laboratorio (reserva del laboratorio completo)
   * o una laptop (reserva de laptop individual). El tipo de reserva se deduce del recurso.
   */
  @IsUUID()
  resourceId!: string;

  /** Inicio en ISO 8601 con zona, por ejemplo 2026-11-12T15:00:00Z (10:00 en Ecuador) */
  @ApiProperty({ example: '2026-11-12T15:00:00Z' })
  @IsDateString()
  startDateTime!: string;

  @ApiProperty({ example: '2026-11-12T16:00:00Z' })
  @IsDateString()
  endDateTime!: string;

  /** Motivo (RF-07) */
  @ApiProperty({ enum: [...PURPOSES], example: 'INTERNAL_MEETING' })
  @IsIn([...PURPOSES])
  purpose!: string;

  /** Detalle o justificación del motivo (RF-07) */
  @ApiProperty({ example: 'Planificación del sprint 3' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  justification!: string;
}

export class CheckInDto {
  /** Cómo registró el uso: botón en la app o código QR en la sala */
  @ApiProperty({ enum: [...CHECK_IN_METHODS], required: false, default: 'BUTTON' })
  @IsOptional()
  @IsIn([...CHECK_IN_METHODS])
  method?: string;
}

export class MyReservationsQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: [...RESERVATION_STATUSES], required: false })
  @IsOptional()
  @IsIn([...RESERVATION_STATUSES])
  status?: string;

  /** Desde (ISO 8601) */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Hasta (ISO 8601) */
  @IsOptional()
  @IsDateString()
  to?: string;
}
