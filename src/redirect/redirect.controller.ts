import { Controller, Get, Param, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { RedirectService } from './redirect.service';

@ApiTags('Motor de Redirección')
@Controller()
export class RedirectController {
  constructor(private readonly redirectService: RedirectService) {}

  @Get(':alias')
  @ApiOperation({ summary: 'Redirección de alias a URL original' })
  @ApiParam({ name: 'alias', description: 'Alias del enlace a redirigir' })
  @ApiResponse({ status: 302, description: 'Redirección exitosa a la URL de destino.' })
  @ApiResponse({ status: 404, description: 'Enlace no encontrado o inactivo.' })
  async redirect(@Param('alias') alias: string, @Res() res: any) {
    const link = await this.redirectService.findLinkByAlias(alias);

    if (!link || !link.activo) {
      throw new NotFoundException('Enlace no encontrado o inactivo');
    }

    const visitData = {
      linkId: link.id,
      ip: res.req.ip || 'Unknown',
      browser: res.req.useragent?.browser || 'Unknown',
      os: res.req.useragent?.os || 'Unknown',
      device: res.req.useragent?.isMobile ? 'Mobile' : 'Desktop',
      referrer: res.req.get('referer') || 'Direct',
    };

    this.redirectService.logVisit(visitData);

    return res.redirect(302, link.url);
  }
}
