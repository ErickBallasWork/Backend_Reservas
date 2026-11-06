import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SANCTION_STATUSES } from '../../common/constants';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class ListSanctionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: [...SANCTION_STATUSES] })
  @IsOptional()
  @IsIn([...SANCTION_STATUSES])
  status?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class ResolveSanctionDto {
  @ApiPropertyOptional({ description: 'Optional comment from the administrator' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
