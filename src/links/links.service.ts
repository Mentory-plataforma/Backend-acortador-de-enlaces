import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateLinkDto, UpdateLinkDto } from './dto/link.dto';

@Injectable()
export class LinksService {
  constructor(private db: DatabaseService) {}

  private generateRandomAlias(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  async create(dto: CreateLinkDto, userId: string) {
    const alias = dto.alias || this.generateRandomAlias();
    try {
      const result = await this.db.query(
        'INSERT INTO links (url, alias, user_id) VALUES ($1, $2, $3) RETURNING *',
        [dto.url, alias, userId]
      );
      return result[0];
    } catch (error) {
      if (error.code === '23505') {
        throw new BadRequestException('El alias ya está en uso');
      }
      throw error;
    }
  }

  async findAll(userId: string) {
    const result = await this.db.query(
      `SELECT l.*, COUNT(v.id) AS total_clicks 
       FROM links l 
       LEFT JOIN visitas v ON l.id = v.link_id
       WHERE l.activo = true AND l.user_id = $1
       GROUP BY l.id`,
      [userId]
    );
    return result;
  }

  async update(alias: string, dto: UpdateLinkDto, userId: string) {
    let result;
    try {
      result = await this.db.query(
        `UPDATE links SET
           url = COALESCE($1, url),
           alias = COALESCE($2, alias),
           activo = COALESCE($3, activo),
           updated_at = CURRENT_TIMESTAMP
         WHERE alias = $4 AND user_id = $5 RETURNING *`,
        [dto.url ?? null, dto.alias ?? null, dto.activo ?? null, alias, userId]
      );
    } catch (error) {
      if (error.code === '23505') {
        throw new BadRequestException('El alias ya está en uso');
      }
      throw error;
    }
    if (result.length === 0) {
      throw new ForbiddenException('Enlace no encontrado o no tienes permiso para editarlo');
    }
    return result[0];
  }

  async deactivate(alias: string, userId: string) {
    return this.update(alias, { activo: false }, userId);
  }
}
