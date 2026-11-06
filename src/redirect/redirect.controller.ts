import { Controller, Get, Param, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { RedirectService } from './redirect.service';

@ApiTags('Motor de Redirección')
@Controller()
export class RedirectController {
  constructor(private readonly redirectService: RedirectService) {}

  @Get('/setcookie')
    @ApiOperation({summary: 'Endpoint de Prueba Para mandar cookie al navegador del Cliente'})
    async setcookie(@Res({passthrough: true}) response: Response) {
      const sessionid = crypto.randomUUID();
      // Checkpoint de que entra a la ruta
      console.log('Ruta Hecha');

      response.cookie('prueba', sessionid, {httpOnly: true});

      return 'Cookie Enviada'
    }

  @Get('/readcookie')
  @ApiOperation({summary: 'Endpoint de Prueba para Consultar Cookies Creadas en el navegador'})
  async leocookie(@Req() request: Request) {
    console.log('Leo Cookie');

    let cookie = request.cookies['prueba'];

    let cookie2 = request.cookies['Cookie'];

    let cookieall = request.cookies;

    // Valido existencia de cadena/cookie
    if(cookieall.VALUES === ''){
      return 'No hay una Cookie asignada';
    }

    return 'Cookies  Leida: 1. ' + cookie + '2. '+ cookie2;
  }

  @Get('Clearcookie')
  @ApiOperation({ summary : 'Endpoint de Prueba para limpiar las cookies del navegador ya definidas al usuario'})
  async limpiocookie(@Res({passthrough: true}) res: Response) {
    console.log('Cookie Limpiada');
    res.clearCookie('prueba');
    return 'Cookie Limpiada'
  }

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
