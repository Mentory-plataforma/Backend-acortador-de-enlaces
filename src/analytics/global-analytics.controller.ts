import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GlobalAnalyticsService } from './global-analytics.service';

/**
 * Estadísticas generales de TODOS los enlaces del usuario autenticado.
 * Ruta base: /api/analytics (se usa un prefijo distinto a /api/stats para no
 * chocar con /api/stats/:alias, que es el detalle por enlace).
 */
@ApiTags('Analíticas generales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class GlobalAnalyticsController {
  constructor(private readonly globalAnalyticsService: GlobalAnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumen para las tarjetas del Dashboard (enlaces y clics globales)' })
  @ApiResponse({ status: 200, description: 'Resumen obtenido exitosamente.' })
  async getSummary(@Req() req: any) {
    const data = await this.globalAnalyticsService.getSummary(req.user.userId);
    return { success: true, data };
  }

  @Get('general')
  @ApiOperation({ summary: 'Estadísticas generales filtrables de los clics de todos los enlaces' })
  @ApiQuery({ name: 'field', required: false, description: 'all, alias, token, user_agent, ip, pais, estado, region, browser, os, device, referrer, created_at' })
  @ApiQuery({ name: 'value', required: false, description: 'Texto a buscar (ILIKE) en el campo elegido' })
  @ApiQuery({ name: 'alias', required: false, description: 'Limitar a un enlace concreto' })
  @ApiQuery({ name: 'status', required: false, description: 'all | active | inactive' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hourFrom', required: false, description: '0-23' })
  @ApiQuery({ name: 'hourTo', required: false, description: '0-23' })
  @ApiQuery({ name: 'weekdays', required: false, description: 'Lista ISO separada por comas (1=lunes … 7=domingo)' })
  @ApiQuery({ name: 'period', required: false, description: 'hour | day | week | month' })
  @ApiQuery({ name: 'timeZone', required: false, description: 'Zona horaria IANA, ej. America/Mexico_City' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Estadísticas generales obtenidas exitosamente.' })
  @ApiResponse({ status: 400, description: 'Filtro no válido.' })
  async getGeneral(
    @Req() req: any,
    @Query('field') field?: string,
    @Query('value') value?: string,
    @Query('alias') alias?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('hourFrom') hourFrom?: string,
    @Query('hourTo') hourTo?: string,
    @Query('weekdays') weekdays?: string,
    @Query('period') period?: string,
    @Query('timeZone') timeZone?: string,
  ) {
    const data = await this.globalAnalyticsService.getGeneralStats(req.user.userId, {
      field,
      value,
      alias,
      status,
      page: Number(page) || 1,
      limit: Number(limit) || 25,
      dateFrom,
      dateTo,
      hourFrom,
      hourTo,
      weekdays,
      period,
      timeZone,
    });
    return { success: true, data };
  }
}
