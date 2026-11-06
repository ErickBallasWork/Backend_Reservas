import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReallocateReservationDto {
  @ApiPropertyOptional({ description: 'New room. The current one is kept when omitted' })
  @IsOptional()
  @IsUUID()
  newResourceId?: string;

  @ApiPropertyOptional({ description: 'New start (ISO 8601)', example: '2026-11-12T17:00:00Z' })
  @IsOptional()
  @IsDateString()
  newStartDateTime?: string;

  @ApiPropertyOptional({ description: 'New end (ISO 8601)', example: '2026-11-12T18:00:00Z' })
  @IsOptional()
  @IsDateString()
  newEndDateTime?: string;

  @ApiProperty({
    description: 'Reason shown to the affected associate',
    example: 'Visita de cliente en la Sala Pichincha',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  justification!: string;
}
