import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { AuditQueryDto } from './audit-query.dto';
import { AuditService } from './audit.service';

@ApiTags('Auditoría')
@Roles('ADMIN')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Registro de auditoría (HU-26)' })
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}
