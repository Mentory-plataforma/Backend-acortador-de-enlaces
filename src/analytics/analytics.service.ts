import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface ClickFilter {
  field?: string;
  value?: string;
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: string;
  hourTo?: string;
  period?: string;
  timeZone?: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private db: DatabaseService) {}

  async checkExists(alias: string): Promise<boolean> {
    const link = await this.db.query('SELECT id FROM links WHERE alias = $1', [alias]);
    return link.length > 0;
  }

  async getClicks(alias: string, userId: string, filter: ClickFilter) {
    const link = await this.db.query(
      'SELECT id, alias, url FROM links WHERE alias = $1 AND user_id = $2',
      [alias, userId],
    );
    if (link.length === 0) return null;

    const fieldColumns: Record<string, string> = {
      token: 'token',
      user_agent: 'user_agent',
      ip: 'ip',
      pais: 'pais',
      estado: 'estado',
      browser: 'browser',
      os: 'os',
      device: 'device',
      referrer: 'referrer',
      created_at: 'created_at::text',
      region: 'region',
    };
    const field = filter.field || 'all';
    if (field !== 'all' && !fieldColumns[field]) {
      throw new BadRequestException('Campo de filtro no válido');
    }

    const period = filter.period || 'day';
    if (!['day', 'week', 'month'].includes(period)) {
      throw new BadRequestException('El periodo debe ser day, week o month');
    }

    const timeZone = filter.timeZone?.trim() || 'UTC';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      throw new BadRequestException('La zona horaria no es válida');
    }

    const validateDate = (value?: string) => {
      if (!value) return undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException('La fecha debe usar el formato YYYY-MM-DD');
      }
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new BadRequestException('La fecha no es válida');
      }
      return value;
    };
    const dateFrom = validateDate(filter.dateFrom);
    const dateTo = validateDate(filter.dateTo);
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('La fecha inicial debe ser anterior o igual a la fecha final');
    }

    const validateHour = (value?: string) => {
      if (value === undefined || value === '') return undefined;
      const hour = Number(value);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new BadRequestException('La hora debe estar entre 0 y 23');
      }
      return hour;
    };
    const hourFrom = validateHour(filter.hourFrom);
    const hourTo = validateHour(filter.hourTo);

    const timeParams: Array<string | number> = [link[0].id];
    const timeConditions = ['link_id = $1'];
    const hasTimeFilter = Boolean(
      dateFrom || dateTo || hourFrom !== undefined || hourTo !== undefined,
    );
    let localCreatedAt: string | undefined;
    if (hasTimeFilter) {
      timeParams.push(timeZone);
      const timeZonePlaceholder = `$${timeParams.length}::text`;
      localCreatedAt = `(created_at AT TIME ZONE ${timeZonePlaceholder})`;
    }

    if (dateFrom) {
      timeParams.push(dateFrom);
      timeConditions.push(
        `created_at >= ($${timeParams.length}::date::timestamp AT TIME ZONE $2::text)`,
      );
    }
    if (dateTo) {
      timeParams.push(dateTo);
      timeConditions.push(
        `created_at < (($${timeParams.length}::date + 1)::timestamp AT TIME ZONE $2::text)`,
      );
    }
    if (hourFrom !== undefined && hourTo !== undefined) {
      timeParams.push(hourFrom, hourTo);
      const fromPlaceholder = `$${timeParams.length - 1}`;
      const toPlaceholder = `$${timeParams.length}`;
      const hourExpression = `EXTRACT(HOUR FROM ${localCreatedAt})::int`;
      timeConditions.push(
        hourFrom <= hourTo
          ? `${hourExpression} BETWEEN ${fromPlaceholder} AND ${toPlaceholder}`
          : `(${hourExpression} >= ${fromPlaceholder} OR ${hourExpression} <= ${toPlaceholder})`,
      );
    } else if (hourFrom !== undefined) {
      timeParams.push(hourFrom);
      timeConditions.push(`EXTRACT(HOUR FROM ${localCreatedAt})::int >= $${timeParams.length}`);
    } else if (hourTo !== undefined) {
      timeParams.push(hourTo);
      timeConditions.push(`EXTRACT(HOUR FROM ${localCreatedAt})::int <= $${timeParams.length}`);
    }

    const timeWhere = timeConditions.join(' AND ');
    const whereConditions = [...timeConditions];
    const whereParams: Array<string | number> = [...timeParams];
    const value = filter.value?.trim();
    if (value) {
      whereParams.push(`%${value}%`);
      const placeholder = `$${whereParams.length}`;
      if (field === 'all') {
        const searchColumns = Object.values(fieldColumns)
          .map((column) => `COALESCE(${column}::text, '') ILIKE ${placeholder}`)
          .join(' OR ');
        whereConditions.push(`(${searchColumns})`);
      } else {
        const column = fieldColumns[field];
        whereConditions.push(`COALESCE(${column}::text, '') ILIKE ${placeholder}`);
      }
    }
    const where = whereConditions.join(' AND ');

    const page = Math.max(1, Math.floor(filter.page || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(filter.limit || 25)));
    const offset = (page - 1) * pageSize;
    const linkId = link[0].id;
    const byHourParams = [...whereParams, timeZone];
    const byHourTimeZonePlaceholder = `$${byHourParams.length}::text`;
    const byHourLocalCreatedAt = `(created_at AT TIME ZONE ${byHourTimeZonePlaceholder})`;
    const byPeriodParams = [...whereParams, timeZone, period];
    const byPeriodTimeZonePlaceholder = `$${byPeriodParams.length - 1}::text`;
    const periodPlaceholder = `$${byPeriodParams.length}`;
    const byPeriodLocalCreatedAt = `(created_at AT TIME ZONE ${byPeriodTimeZonePlaceholder})`;
    const [total, uniqueVisitors, matching, clicks, filterValues, byBrowser, byHour, byPeriod] = await Promise.all([
      this.db.query('SELECT COUNT(*) AS count FROM visitas WHERE link_id = $1', [linkId]),
      this.db.query(
        `SELECT COUNT(DISTINCT token) AS count FROM visitas WHERE ${where}`,
        whereParams,
      ),
      this.db.query(`SELECT COUNT(*) AS count FROM visitas WHERE ${where}`, whereParams),
      this.db.query(
        `SELECT id, token, user_agent, ip, pais, estado, browser, os, device, referrer, created_at, region
         FROM visitas WHERE ${where} ORDER BY created_at DESC
         LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
        [...whereParams, pageSize, offset],
      ),
      field === 'all'
        ? Promise.resolve([])
        : this.db.query(
            `SELECT DISTINCT ${fieldColumns[field]}::text AS value
             FROM visitas
             WHERE ${timeWhere}
               AND ${fieldColumns[field]} IS NOT NULL
               AND ${fieldColumns[field]}::text <> ''
             ORDER BY value ASC
             LIMIT 100`,
            timeParams,
          ),
      this.db.query(
        `SELECT COALESCE(browser, 'Unknown') AS browser,
                COUNT(*) AS clicks,
                COUNT(DISTINCT token) AS unique_visitors
         FROM visitas WHERE ${where}
         GROUP BY COALESCE(browser, 'Unknown') ORDER BY clicks DESC`,
        whereParams,
      ),
      this.db.query(
        `SELECT EXTRACT(HOUR FROM ${byHourLocalCreatedAt})::int AS hour, COUNT(*) AS clicks
         FROM visitas WHERE ${where}
         GROUP BY hour ORDER BY hour`,
        byHourParams,
      ),
      this.db.query(
        `SELECT to_char(bucket, 'YYYY-MM-DD"T"HH24:MI:SS') AS bucket, clicks FROM (
           SELECT date_trunc(${periodPlaceholder}, ${byPeriodLocalCreatedAt}) AS bucket, COUNT(*) AS clicks
           FROM visitas WHERE ${where}
           GROUP BY bucket ORDER BY bucket DESC LIMIT 60
         ) AS recent_periods ORDER BY bucket`,
        byPeriodParams,
      ),
    ]);

    const totalClicks = Number(total[0].count);
    const matchingClicks = Number(matching[0].count);
    return {
      link: link[0],
      totalClicks,
      uniqueVisitors: Number(uniqueVisitors[0].count),
      matchingClicks,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(matchingClicks / pageSize)),
      clicks,
      filterOptions: filterValues.map((item) => item.value),
      period,
      timeZone,
      byBrowser: byBrowser.map((item) => ({
        browser: item.browser,
        clicks: Number(item.clicks),
        uniqueVisitors: Number(item.unique_visitors),
      })),
      byHour: byHour.map((item) => ({ hour: Number(item.hour), clicks: Number(item.clicks) })),
      byPeriod: byPeriod.map((item) => ({ bucket: item.bucket, clicks: Number(item.clicks) })),
    };
  }

  async getStats(alias: string, userId: string) {
    const link = await this.db.query(
      'SELECT id FROM links WHERE alias = $1 AND user_id = $2', 
      [alias, userId]
    );
    if (link.length === 0) return null;

    const linkId = link[0].id;

    const [totalVisits, uniqueVisitors, browsers, os, recentVisits] = await Promise.all([
      this.db.query('SELECT COUNT(*) as count FROM visitas WHERE link_id = $1', [linkId]),
      this.db.query('SELECT COUNT(DISTINCT token) as count FROM visitas WHERE link_id = $1', [linkId]),
      this.db.query(
        'SELECT browser, COUNT(*) as count FROM visitas WHERE link_id = $1 GROUP BY browser ORDER BY count DESC LIMIT 5',
        [linkId]
      ),
      this.db.query(
        'SELECT os, COUNT(*) as count FROM visitas WHERE link_id = $1 GROUP BY os ORDER BY count DESC LIMIT 5',
        [linkId]
      ),
      this.db.query(
        'SELECT * FROM visitas WHERE link_id = $1 ORDER BY created_at DESC LIMIT 10',
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
