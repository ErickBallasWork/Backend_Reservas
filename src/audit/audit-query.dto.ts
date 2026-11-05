import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

export class AuditQueryDto extends PaginationQueryDto {
  /** Entidad, por ejemplo Reservation, Resource, Sanction */
  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  /** Usuario que hizo la acción */
  @IsOptional()
  @IsUUID()
  userId?: string;
}
