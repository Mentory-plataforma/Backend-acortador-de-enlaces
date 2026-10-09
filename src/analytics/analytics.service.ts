import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AnalyticsService {
  constructor(private db: DatabaseService) {}

  async checkExists(alias: string): Promise<boolean> {
    const link = await this.db.query('SELECT id FROM links WHERE alias = $1', [alias]);
    return link.length > 0;
  }

  async getStats(alias: string, userId: string) {
    const link = await this.db.query(
      'SELECT id FROM links WHERE alias = $1 AND user_id = $2', 
      [alias, userId]
    );
    if (link.length === 0) return null;

    const linkId = link[0].id;

    const [totalVisits, uniqueVisitors, browsers, os, recentVisits] = await Promise.all([
      this.db.query('SELECT COUNT(*) as count FROM visits WHERE link_id = $1', [linkId]),
      this.db.query('SELECT COUNT(DISTINCT ip) as count FROM visits WHERE link_id = $1', [linkId]),
      this.db.query(
        'SELECT browser, COUNT(*) as count FROM visits WHERE link_id = $1 GROUP BY browser ORDER BY count DESC LIMIT 5',
        [linkId]
      ),
      this.db.query(
        'SELECT os, COUNT(*) as count FROM visits WHERE link_id = $1 GROUP BY os ORDER BY count DESC LIMIT 5',
        [linkId]
      ),
      this.db.query(
        'SELECT * FROM visits WHERE link_id = $1 ORDER BY created_at DESC LIMIT 10',
        [linkId]
      ),
    ]);

    return {
      totalVisits: parseInt(totalVisits[0].count),
      uniqueVisitors: parseInt(uniqueVisitors[0].count),
      browsers,
      os,
      recentVisits,
    };
  }
}
