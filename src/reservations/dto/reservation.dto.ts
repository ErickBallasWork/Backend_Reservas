import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
  @ApiProperty({
    description:
      'A room, an AI lab (books the whole lab) or a laptop. The reservation type is derived from it',
  })
  @IsUUID()
  resourceId!: string;

  @ApiProperty({
    description: 'Start in ISO 8601 with time zone',
    example: '2026-11-12T15:00:00Z',
  })
  @IsDateString()
  startDateTime!: string;

  @ApiProperty({ example: '2026-11-12T16:00:00Z' })
  @IsDateString()
  endDateTime!: string;

  @ApiProperty({ enum: [...PURPOSES], example: 'INTERNAL_MEETING' })
  @IsIn([...PURPOSES])
  purpose!: string;

  @ApiProperty({ description: 'Detail of the purpose', example: 'Planificación del sprint 3' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  justification!: string;
}

export class CheckInDto {
  @ApiPropertyOptional({
    description: 'Button in the app or QR code in the room',
    enum: [...CHECK_IN_METHODS],
    default: 'BUTTON',
  })
  @IsOptional()
  @IsIn([...CHECK_IN_METHODS])
  method?: string;
}

export class MyReservationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: [...RESERVATION_STATUSES] })
  @IsOptional()
  @IsIn([...RESERVATION_STATUSES])
  status?: string;

  @ApiPropertyOptional({ description: 'Range start (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Range end (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
