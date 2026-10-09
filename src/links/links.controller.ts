import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { LinksService } from './links.service';
import { CreateLinkDto, UpdateLinkDto } from './dto/link.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Gestión de Enlaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo enlace acortado' })
  @ApiResponse({ status: 201, description: 'Enlace creado exitosamente.' })
  @ApiResponse({ status: 400, description: 'El alias ya está en uso.' })
  async create(@Body() dto: CreateLinkDto, @Req() req: any) {
    const data = await this.linksService.create(dto, req.user.userId);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los enlaces activos y sus clics' })
  @ApiResponse({ status: 200, description: 'Lista de enlaces obtenida.' })
  async findAll(@Req() req: any) {
    const data = await this.linksService.findAll(req.user.userId);
    return { success: true, data };
  }

  @Put(':alias')
  @ApiOperation({ summary: 'Actualizar la URL de un enlace mediante su alias' })
  @ApiParam({ name: 'alias', description: 'Alias del enlace a actualizar' })
  @ApiResponse({ status: 200, description: 'Enlace actualizado.' })
  @ApiResponse({ status: 403, description: 'Enlace no encontrado o sin permisos.' })
  async update(@Param('alias') alias: string, @Body() dto: UpdateLinkDto, @Req() req: any) {
    const data = await this.linksService.update(alias, dto, req.user.userId);
    return { success: true, data };
  }

  @Delete(':alias')
  @ApiOperation({ summary: 'Borrado lógico de un enlace' })
  @ApiParam({ name: 'alias', description: 'Alias del enlace a desactivar' })
  @ApiResponse({ status: 200, description: 'Enlace desactivado exitosamente.' })
  @ApiResponse({ status: 403, description: 'Enlace no encontrado o sin permisos.' })
  async delete(@Param('alias') alias: string, @Req() req: any) {
    const data = await this.linksService.delete(alias, req.user.userId);
    return { success: true, data };
  }
}
