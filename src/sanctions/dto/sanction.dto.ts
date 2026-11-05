import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SANCTION_STATUSES } from '../../common/constants';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class ListSanctionsQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: [...SANCTION_STATUSES], required: false })
  @IsOptional()
  @IsIn([...SANCTION_STATUSES])
  status?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class ResolveSanctionDto {
  /** Comentario opcional del administrador */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
