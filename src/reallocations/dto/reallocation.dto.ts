import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReallocateReservationDto {
  /** Nueva sala (opcional; si no se envía, se mantiene la actual) */
  @IsOptional()
  @IsUUID()
  newResourceId?: string;

  /** Nuevo inicio (opcional) */
  @ApiProperty({ required: false, example: '2026-11-12T17:00:00Z' })
  @IsOptional()
  @IsDateString()
  newStartDateTime?: string;

  /** Nuevo fin (opcional) */
  @ApiProperty({ required: false, example: '2026-11-12T18:00:00Z' })
  @IsOptional()
  @IsDateString()
  newEndDateTime?: string;

  /** Justificación que verá el asociado afectado (RF-11) */
  @ApiProperty({ example: 'Visita de cliente en la Sala Pichincha' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  justification!: string;
}
