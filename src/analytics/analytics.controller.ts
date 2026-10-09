import { Controller, Get, Param, NotFoundException, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Analíticas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stats')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get(':alias')
  @ApiOperation({ summary: 'Obtener métricas detalladas de un enlace' })
  @ApiParam({ name: 'alias', description: 'Alias del enlace para analizar' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente.' })
  @ApiResponse({ status: 403, description: 'No tienes permiso para ver estas estadísticas.' })
  @ApiResponse({ status: 404, description: 'Enlace no encontrado.' })
  async getStats(@Param('alias') alias: string, @Req() req: any) {
    const data = await this.analyticsService.getStats(alias, req.user.userId);
    if (!data) {
      // Diferenciamos entre no encontrado y no permitido
      const exists = await this.analyticsService.checkExists(alias);
      if (!exists) throw new NotFoundException('Enlace no encontrado');
      throw new ForbiddenException('No tienes permiso para ver estas estadísticas');
    }
    return { success: true, data };
  }
}
