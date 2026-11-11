import { Controller, Get, Param, NotFoundException, UseGuards, Req, ForbiddenException, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Analíticas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stats')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get(':alias/clicks')
  @ApiOperation({ summary: 'Consultar y filtrar los clics de un enlace' })
  @ApiParam({ name: 'alias', description: 'Alias del enlace' })
  @ApiResponse({ status: 200, description: 'Clics del enlace obtenidos exitosamente.' })
  async getClicks(
    @Param('alias') alias: string,
    @Req() req: any,
    @Query('field') field?: string,
    @Query('value') value?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('hourFrom') hourFrom?: string,
    @Query('hourTo') hourTo?: string,
    @Query('period') period?: string,
    @Query('timeZone') timeZone?: string,
  ) {
    const data = await this.analyticsService.getClicks(
      alias,
      req.user.userId,
      {
        field,
        value,
        page: Number(page) || 1,
        limit: Number(limit) || 25,
        dateFrom,
        dateTo,
        hourFrom,
        hourTo,
        period,
        timeZone,
      },
    );

    if (!data) {
      const exists = await this.analyticsService.checkExists(alias);
      if (!exists) throw new NotFoundException('Enlace no encontrado');
      throw new ForbiddenException('No tienes permiso para ver estos clics');
    }

    return { success: true, data };
  }

  @Get(':alias')
  @ApiOperation({ summary: 'Obtener métricas detalladas de un enlace' })
  @ApiParam({ name: 'alias', description: 'Alias del enlace para analizar' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente.' })
  @ApiResponse({ status: 403, description: 'No tienes permiso para ver estas estadísticas.' })
  @ApiResponse({ status: 404, description: 'Enlace no encontrado.' })
  async getStats(@Param('alias') alias: string, @Req() req: any) {
    const data = await this.analyticsService.getStats(alias, req.user.userId);
    if (!data) {
      const exists = await this.analyticsService.checkExists(alias);
      if (!exists) throw new NotFoundException('Enlace no encontrado');
      throw new ForbiddenException('No tienes permiso para ver estas estadísticas');
    }
    return { success: true, data };
  }
}
