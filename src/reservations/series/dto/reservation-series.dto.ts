import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateReservationDto } from '../../dto/reservation.dto';
import { ReservationResponseDto } from '../../dto/reservation-response.dto';
import { MAX_SERIES_OCCURRENCES } from '../recurrence';

export class RecurrenceDto {
  @ApiProperty({ description: 'Repeat every N weeks', minimum: 1, maximum: 4, example: 1 })
  @IsInt()
  @Min(1)
  @Max(4)
  intervalWeeks!: number;

  @ApiProperty({
    type: [Number],
    description:
      'Weekdays of the series, 0 is Sunday. Must include the day of the first reservation',
    example: [4],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays!: number[];

  @ApiPropertyOptional({
    description: `Total reservations of the series, the first one included (up to ${MAX_SERIES_OCCURRENCES})`,
    minimum: 2,
    maximum: MAX_SERIES_OCCURRENCES,
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(MAX_SERIES_OCCURRENCES)
  occurrenceCount?: number;

  @ApiPropertyOptional({
    example: '2027-01-28',
    description: 'Last local date of the series. A series lasts up to 90 days',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  until?: string;
}

export class CreateReservationSeriesDto extends CreateReservationDto {
  @ApiProperty({
    type: RecurrenceDto,
    description: 'The start and end of the body are the first reservation of the series',
  })
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence!: RecurrenceDto;
}

export class SeriesOccurrencePreviewDto {
  @ApiProperty({ description: 'Position in the series, starting at 1' })
  index!: number;

  @ApiProperty({ format: 'date-time' })
  startDateTime!: string;

  @ApiProperty({ format: 'date-time' })
  endDateTime!: string;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Error code that would reject this occurrence',
  })
  reason!: string | null;
}

export class SeriesPreviewResponseDto {
  @ApiProperty({ type: [SeriesOccurrencePreviewDto] })
  occurrences!: SeriesOccurrencePreviewDto[];
}

export class ReservationSeriesDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  resourceId!: string;

  @ApiProperty()
  intervalWeeks!: number;

  @ApiProperty({ type: [Number] })
  weekdays!: number[];

  @ApiProperty({ format: 'date-time' })
  firstStartDateTime!: Date;

  @ApiProperty()
  durationMinutes!: number;

  @ApiProperty({ description: 'Reservations created for the series' })
  occurrenceCount!: number;

  @ApiProperty({ type: Date, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;
}

export class SkippedOccurrenceDto {
  @ApiProperty()
  startDateTime!: string;

  @ApiProperty()
  endDateTime!: string;

  @ApiProperty({ description: 'Error code that rejected the occurrence' })
  reason!: string;
}

export class SeriesCreatedResponseDto {
  @ApiProperty({ type: ReservationSeriesDto })
  series!: ReservationSeriesDto;

  @ApiProperty({ type: [ReservationResponseDto] })
  created!: ReservationResponseDto[];

  @ApiProperty({ type: [SkippedOccurrenceDto], description: 'Occurrences that were not created' })
  skipped!: SkippedOccurrenceDto[];
}

export class SeriesDetailResponseDto {
  @ApiProperty({ type: ReservationSeriesDto })
  series!: ReservationSeriesDto;

  @ApiProperty({ type: [ReservationResponseDto] })
  occurrences!: ReservationResponseDto[];
}

export class SeriesCancelResponseDto {
  @ApiProperty({ type: ReservationSeriesDto })
  series!: ReservationSeriesDto;

  @ApiProperty({ description: 'Reservations cancelled' })
  cancelled!: number;

  @ApiProperty({ description: 'Reservations kept because they start in less than 24 h' })
  kept!: number;
}
