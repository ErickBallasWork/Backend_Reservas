import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PURPOSES, TRANSFER_STATUSES } from '../../common/constants';
import { PaginationQueryDto } from '../../common/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTransferRequestDto {
  @ApiProperty({
    enum: [...PURPOSES],
    example: 'CLIENT_MEETING',
    description: 'Purpose of the reservation the requester gets if the owner accepts',
  })
  @IsIn([...PURPOSES])
  purpose!: string;

  @ApiProperty({
    description: 'Why the requester needs the resource. The owner reads it in the notice',
    example: 'Llega un cliente a las 10:00 y es la única sala con pantalla grande.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  justification!: string;

  @ApiPropertyOptional({
    description:
      'People who will attend. Required for rooms and AI labs, up to the capacity of the resource. Ignored for laptops',
    example: 6,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  attendees?: number;
}

export class RespondTransferDto {
  @ApiPropertyOptional({
    description: 'Message for the requester. Required when rejecting',
    maxLength: 500,
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class TransferListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: [...TRANSFER_STATUSES] })
  @IsOptional()
  @IsIn([...TRANSFER_STATUSES])
  status?: string;
}
