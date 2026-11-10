import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DatabaseService } from '../database/database.service';

export interface IpGeolocation {
  pais: string;
  estado: string;
  region: string;
}

interface IpApiResponse {
  status: 'success' | 'fail';
  country?: string;
  region?: string;
  regionName?: string;
}

interface VisitData {
  linkId: string;
  token: string;
  userAgent: string;
  ip: string;
  pais: string;
  estado: string;
  browser: string;
  os: string;
  device: string;
  referrer: string;
  region: string;
}

@Injectable()
export class RedirectService {
  private readonly logger = new Logger(RedirectService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly httpService: HttpService,
  ) {}

  async getIpGeolocation(ip: string): Promise<IpGeolocation> {
    const unknown: IpGeolocation = {
      pais: 'Unknown',
      estado: 'Unknown',
      region: 'Unknown',
    };

    // ip-api no puede resolver direcciones privadas, loopback ni valores ausentes.
    if (!ip || ip === 'Unknown' || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.') || ip.startsWith('::ffff:127.')) {
      return unknown;
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.get<IpApiResponse>(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
          params: { fields: 'status,country,region,regionName' },
        }),
      );

      if (data.status !== 'success') return unknown;

      return {
        pais: data.country ?? 'Unknown',
        estado: data.regionName ?? 'Unknown',
        region: data.region ?? 'Unknown',
      };
    } catch (error) {
      this.logger.warn(`No se pudo consultar la geolocalización de IP: ${String(error)}`);
      return unknown;
    }
  }

  async findLinkByAlias(alias: string) {
    const result = await this.db.query(
      'SELECT id, url, activo FROM links WHERE alias = $1',
      [alias]
    );
    return result[0];
  }

  async logVisit(visitData: VisitData) {
    try {
      await this.db.query(
        'INSERT INTO visitas (link_id, token, user_agent, ip, pais, estado, browser, os, device, referrer, region) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [visitData.linkId, visitData.token, visitData.userAgent, visitData.ip, visitData.pais, visitData.estado, visitData.browser, visitData.os, visitData.device, visitData.referrer, visitData.region],
      );
    } catch (error) {
      this.logger.error(
        'Error logging visit:',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
