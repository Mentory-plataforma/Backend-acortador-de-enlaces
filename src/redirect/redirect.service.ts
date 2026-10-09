import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class RedirectService {
  constructor(private db: DatabaseService) {}

  async findLinkByAlias(alias: string) {
    const result = await this.db.query(
      'SELECT id, url, activo FROM links WHERE alias = $1',
      [alias]
    );
    return result[0];
  }

  async logVisit(visitData: {
    linkId: string;
    ip: string;
    browser: string;
    os: string;
    device: string;
    referrer: string;
  }) {
    try {
      await this.db.query(
        'INSERT INTO visits (link_id, ip, browser, os, device, referrer) VALUES ($1, $2, $3, $4, $5, $6)',
        [visitData.linkId, visitData.ip, visitData.browser, visitData.os, visitData.device, visitData.referrer]
      );
    } catch (error) {
      console.error('Error logging visit:', error);
    }
  }
}
