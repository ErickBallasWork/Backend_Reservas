import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
  @ApiProperty({ description: 'Reason the administrator regularizes the sanction', maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  comment!: string;
}
