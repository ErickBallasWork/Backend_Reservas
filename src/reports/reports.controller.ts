import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { DateRangeQueryDto, OccupancyQueryDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reportes (Administrador)')
@Roles('ADMIN')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('occupancy')
  @ApiOperation({ summary: 'Tasa de ocupación por recurso, edificio o laptop (HU-23)' })
  occupancy(@Query() query: OccupancyQueryDto) {
    return this.reports.occupancy(query);
  }

  @Get('occupancy/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ocupacion.csv"')
  @ApiOperation({ summary: 'Descargar la ocupación en CSV (abre en Excel)' })
  occupancyCsv(@Query() query: OccupancyQueryDto) {
    return this.reports.occupancyCsv(query);
  }

  @Get('usage-by-department')
  @ApiOperation({ summary: 'Uso por área: reservas, check-in, No-Show y cancelaciones' })
  usageByDepartment(@Query() query: DateRangeQueryDto) {
    return this.reports.usageByDepartment(query);
  }

  @Get('usage-by-department/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="uso-por-area.csv"')
  @ApiOperation({ summary: 'Descargar el uso por área en CSV' })
  usageByDepartmentCsv(@Query() query: DateRangeQueryDto) {
    return this.reports.usageByDepartmentCsv(query);
  }
}
