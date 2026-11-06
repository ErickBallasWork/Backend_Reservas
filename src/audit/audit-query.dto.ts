import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Entity name, for example Reservation, Resource or Sanction',
  })
  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: 'User who performed the action' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
