import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PURPOSES, TRANSFER_STATUSES } from '../../common/constants';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class CreateTransferRequestDto {
  /** Motivo de la reserva que tendrás si te la ceden (RF-07) */
  @ApiProperty({ enum: [...PURPOSES], example: 'CLIENT_MEETING' })
  @IsIn([...PURPOSES])
  purpose: string;

  /** Por qué necesitas esta sala en ese horario. Le llega al dueño de la reserva. */
  @ApiProperty({ example: 'Llega un cliente a las 10:00 y es la única sala con pantalla grande.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  justification: string;
}

export class RespondTransferDto {
  /** Comentario para quien pidió la reserva. Obligatorio al rechazar. */
  @ApiProperty({ required: false, example: 'Tengo una entrevista con un candidato a esa hora.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class TransferListQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: [...TRANSFER_STATUSES], required: false })
  @IsOptional()
  @IsIn([...TRANSFER_STATUSES])
  status?: string;
}