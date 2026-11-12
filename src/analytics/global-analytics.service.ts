import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * Estadísticas GENERALES: agregan los clics (tabla `visitas`) de TODOS los
 * enlaces (`links`) que pertenecen al usuario autenticado.
 *
 * Se diferencia de AnalyticsService.getClicks (detalle por enlace) en que la
 * relación base es `visitas v JOIN links l ON l.id = v.link_id WHERE l.user_id = $1`
 * y en que agrega dimensiones extra (por enlace, día de la semana, mapa de calor,
 * país, sistema, dispositivo y referer).
 */

export type GlobalPeriod = 'hour' | 'day' | 'week' | 'month';
export type LinkStatusFilter = 'all' | 'active' | 'inactive';

export interface GlobalClickFilter {
  field?: string;
  value?: string;
  alias?: string;
  status?: string;
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: string;
  hourTo?: string;
  weekdays?: string;
  period?: string;
  timeZone?: string;
}

interface NormalizedFilter {
  field: string;
  value?: string;
  alias?: string;
  status: LinkStatusFilter;
  page: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: number;
  hourTo?: number;
  weekdays: number[];
  period: GlobalPeriod;
  timeZone: string;
}

/** Acumula parámetros posicionales ($1, $2, ...) de forma segura. */
class SqlParams {
  readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Columnas filtrables de la tabla visitas (+ alias del enlace). */
const FIELD_COLUMNS: Record<string, string> = {
  alias: 'l.alias',
  token: 'v.token',
  user_agent: 'v.user_agent',
  ip: 'v.ip',
  pais: 'v.pais',
  estado: 'v.estado',
  region: 'v.region',
  browser: 'v.browser',
  os: 'v.os',
  device: 'v.device',
  referrer: 'v.referrer',
  created_at: 'v.created_at::text',
};

/** Dimensiones que se agrupan para los desgloses (top N). */
const BREAKDOWN_COLUMNS = {
  browser: 'v.browser',
  os: 'v.os',
  device: 'v.device',
  pais: 'v.pais',
  estado: 'v.estado',
  referrer: 'v.referrer',
} as const;

type BreakdownKey = keyof typeof BREAKDOWN_COLUMNS;

const PERIOD_LIMITS: Record<GlobalPeriod, number> = {
  hour: 168, // 7 días de horas
  day: 120,
  week: 104,
  month: 60,
};

@Injectable()
export class GlobalAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  /** Resumen ligero para las tarjetas del Dashboard. */
  async getSummary(userId: string) {
    const rows = await this.db.query<any[]>(
      `SELECT
         (SELECT COUNT(*) FROM links WHERE user_id = $1 AND activo = true) AS active_links,
         (SELECT COUNT(*) FROM links WHERE user_id = $1) AS all_links,
         COUNT(v.id) FILTER (WHERE l.activo = true) AS active_clicks,
         COUNT(v.id) AS all_clicks
       FROM links l
       LEFT JOIN visitas v ON v.link_id = l.id
       WHERE l.user_id = $1`,
      [userId],
    );
    const row = rows[0] ?? {};
    return {
      totalLinks: Number(row.active_links ?? 0),
      totalClicks: Number(row.active_clicks ?? 0),
      allLinks: Number(row.all_links ?? 0),
      allClicks: Number(row.all_clicks ?? 0),
    };
  }

  /** Estadísticas generales filtrables de todos los enlaces del usuario. */
  async getGeneralStats(userId: string, rawFilter: GlobalClickFilter) {
    const filter = this.normalize(rawFilter);
    const tz = filter.timeZone;

    // ---------- Consultas sin filtros (contexto global del usuario) ----------
    const overviewQuery = this.db.query<any[]>(
      `SELECT
         (SELECT COUNT(*) FROM links WHERE user_id = $1) AS total_links,
         (SELECT COUNT(*) FROM links WHERE user_id = $1 AND activo = true) AS active_links,
         COUNT(v.id) AS total_clicks,
         COUNT(DISTINCT v.token) AS unique_visitors,
         COUNT(v.id) FILTER (
           WHERE (v.created_at AT TIME ZONE $2::text)::date = (now() AT TIME ZONE $2::text)::date
         ) AS clicks_today,
         COUNT(v.id) FILTER (
           WHERE (v.created_at AT TIME ZONE $2::text)::date >= (now() AT TIME ZONE $2::text)::date - 6
         ) AS clicks_last7,
         COUNT(v.id) FILTER (
           WHERE (v.created_at AT TIME ZONE $2::text)::date >= (now() AT TIME ZONE $2::text)::date - 29
         ) AS clicks_last30,
         MIN(v.created_at) AS first_click,
         MAX(v.created_at) AS last_click
       FROM visitas v
       JOIN links l ON l.id = v.link_id
       WHERE l.user_id = $1`,
      [userId, tz],
    );

    const linkOptionsQuery = this.db.query<any[]>(
      `SELECT alias, url, activo FROM links WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );

    // ---------- Consultas con filtros ----------
    const summaryQuery = this.run(
      userId,
      filter,
      (where, p) => `
        SELECT COUNT(*) AS clicks,
               COUNT(DISTINCT v.token) AS unique_visitors,
               COUNT(DISTINCT v.link_id) AS links_with_clicks,
               COUNT(DISTINCT (v.created_at AT TIME ZONE ${p.add(tz)}::text)::date) AS active_days,
               MIN(v.created_at) AS first_click,
               MAX(v.created_at) AS last_click
        FROM visitas v JOIN links l ON l.id = v.link_id
        WHERE ${where}`,
    );

    const byPeriodQuery = this.run(userId, filter, (where, p) => {
      const local = `(v.created_at AT TIME ZONE ${p.add(tz)}::text)`;
      const period = p.add(filter.period);
      const limit = p.add(PERIOD_LIMITS[filter.period]);
      return `
        SELECT to_char(bucket, 'YYYY-MM-DD"T"HH24:MI:SS') AS bucket, clicks, unique_visitors FROM (
          SELECT date_trunc(${period}, ${local}) AS bucket,
                 COUNT(*) AS clicks,
                 COUNT(DISTINCT v.token) AS unique_visitors
          FROM visitas v JOIN links l ON l.id = v.link_id
          WHERE ${where}
          GROUP BY bucket ORDER BY bucket DESC LIMIT ${limit}
        ) AS recent ORDER BY bucket`;
    });

    const byHourQuery = this.run(userId, filter, (where, p) => {
      const local = `(v.created_at AT TIME ZONE ${p.add(tz)}::text)`;
      return `
        SELECT EXTRACT(HOUR FROM ${local})::int AS hour, COUNT(*) AS clicks
        FROM visitas v JOIN links l ON l.id = v.link_id
        WHERE ${where}
        GROUP BY hour ORDER BY hour`;
    });

    const byWeekdayQuery = this.run(userId, filter, (where, p) => {
      const local = `(v.created_at AT TIME ZONE ${p.add(tz)}::text)`;
      return `
        SELECT EXTRACT(ISODOW FROM ${local})::int AS weekday, COUNT(*) AS clicks
        FROM visitas v JOIN links l ON l.id = v.link_id
        WHERE ${where}
        GROUP BY weekday ORDER BY weekday`;
    });

    const heatmapQuery = this.run(userId, filter, (where, p) => {
      const local = `(v.created_at AT TIME ZONE ${p.add(tz)}::text)`;
      return `
        SELECT EXTRACT(ISODOW FROM ${local})::int AS weekday,
               EXTRACT(HOUR FROM ${local})::int AS hour,
               COUNT(*) AS clicks
        FROM visitas v JOIN links l ON l.id = v.link_id
        WHERE ${where}
        GROUP BY weekday, hour`;
    });

    const byLinkQuery = this.run(
      userId,
      filter,
      (where) => `
        SELECT l.alias, l.url, l.activo,
               COUNT(*) AS clicks,
               COUNT(DISTINCT v.token) AS unique_visitors,
               MAX(v.created_at) AS last_click
        FROM visitas v JOIN links l ON l.id = v.link_id
        WHERE ${where}
        GROUP BY l.id, l.alias, l.url, l.activo
        ORDER BY clicks DESC, l.alias ASC
        LIMIT 50`,
    );

    const breakdownKeys = Object.keys(BREAKDOWN_COLUMNS) as BreakdownKey[];
    const breakdownQueries = breakdownKeys.map((key) =>
      this.run(
        userId,
        filter,
        (where) => `
          SELECT COALESCE(NULLIF(${BREAKDOWN_COLUMNS[key]}, ''), 'Unknown') AS label,
                 COUNT(*) AS clicks,
                 COUNT(DISTINCT v.token) AS unique_visitors
          FROM visitas v JOIN links l ON l.id = v.link_id
          WHERE ${where}
          GROUP BY label ORDER BY clicks DESC LIMIT 10`,
      ),
    );

    const offset = (filter.page - 1) * filter.pageSize;
    const clicksQuery = this.run(
      userId,
      filter,
      (where, p) => `
        SELECT v.id, l.alias, v.token, v.user_agent, v.ip, v.pais, v.estado, v.region,
               v.browser, v.os, v.device, v.referrer, v.created_at
        FROM visitas v JOIN links l ON l.id = v.link_id
        WHERE ${where}
        ORDER BY v.created_at DESC
        LIMIT ${p.add(filter.pageSize)} OFFSET ${p.add(offset)}`,
    );

    // Opciones del desplegable: se calculan sin el filtro de valor para que
    // el usuario pueda cambiar de valor sin perder las opciones.
    const filterOptionsQuery =
      filter.field === 'all'
        ? Promise.resolve([] as any[])
        : this.run(
            userId,
            { ...filter, value: undefined },
            (where) => `
              SELECT DISTINCT ${FIELD_COLUMNS[filter.field]} AS value
              FROM visitas v JOIN links l ON l.id = v.link_id
              WHERE ${where}
                AND ${FIELD_COLUMNS[filter.field]} IS NOT NULL
                AND ${FIELD_COLUMNS[filter.field]} <> ''
              ORDER BY value ASC
              LIMIT 100`,
          );

    // Comparación contra el periodo anterior de la misma duración.
    const previousRange = this.previousRange(filter.dateFrom, filter.dateTo);
    const previousQuery = previousRange
      ? this.run(
          userId,
          { ...filter, dateFrom: previousRange.from, dateTo: previousRange.to },
          (where) => `
            SELECT COUNT(*) AS clicks
            FROM visitas v JOIN links l ON l.id = v.link_id
            WHERE ${where}`,
        )
      : Promise.resolve(null);

    const [
      overviewRows,
      linkOptions,
      summaryRows,
      byPeriod,
      byHour,
      byWeekday,
      heatmap,
      byLink,
      clicks,
      filterOptions,
      previousRows,
      ...breakdownResults
    ] = await Promise.all([
      overviewQuery,
      linkOptionsQuery,
      summaryQuery,
      byPeriodQuery,
      byHourQuery,
      byWeekdayQuery,
      heatmapQuery,
      byLinkQuery,
      clicksQuery,
      filterOptionsQuery,
      previousQuery,
      ...breakdownQueries,
    ]);

    const overview = overviewRows[0] ?? {};
    const summary = summaryRows[0] ?? {};
    const matchingClicks = Number(summary.clicks ?? 0);
    const activeDays = Number(summary.active_days ?? 0);
    const linksWithClicks = Number(summary.links_with_clicks ?? 0);

    const breakdowns = breakdownKeys.reduce(
      (acc, key, index) => {
        acc[key] = (breakdownResults[index] as any[]).map((row) => ({
          label: row.label,
          clicks: Number(row.clicks),
          uniqueVisitors: Number(row.unique_visitors),
        }));
        return acc;
      },
      {} as Record<BreakdownKey, { label: string; clicks: number; uniqueVisitors: number }[]>,
    );

    const hourTotals = byHour.map((row: any) => ({ hour: Number(row.hour), clicks: Number(row.clicks) }));
    const weekdayTotals = byWeekday.map((row: any) => ({
      weekday: Number(row.weekday),
      clicks: Number(row.clicks),
    }));
    const peakHour = [...hourTotals].sort((a, b) => b.clicks - a.clicks)[0] ?? null;
    const peakWeekday = [...weekdayTotals].sort((a, b) => b.clicks - a.clicks)[0] ?? null;

    return {
      overview: {
        totalLinks: Number(overview.total_links ?? 0),
        activeLinks: Number(overview.active_links ?? 0),
        totalClicks: Number(overview.total_clicks ?? 0),
        uniqueVisitors: Number(overview.unique_visitors ?? 0),
        clicksToday: Number(overview.clicks_today ?? 0),
        clicksLast7Days: Number(overview.clicks_last7 ?? 0),
        clicksLast30Days: Number(overview.clicks_last30 ?? 0),
        firstClick: overview.first_click ?? null,
        lastClick: overview.last_click ?? null,
      },
      summary: {
        matchingClicks,
        uniqueVisitors: Number(summary.unique_visitors ?? 0),
        linksWithClicks,
        activeDays,
        avgClicksPerDay: activeDays ? Number((matchingClicks / activeDays).toFixed(2)) : 0,
        avgClicksPerLink: linksWithClicks ? Number((matchingClicks / linksWithClicks).toFixed(2)) : 0,
        firstClick: summary.first_click ?? null,
        lastClick: summary.last_click ?? null,
        peakHour,
        peakWeekday,
        previousPeriodClicks: previousRows ? Number((previousRows as any[])[0]?.clicks ?? 0) : null,
        previousPeriod: previousRange,
      },
      byPeriod: byPeriod.map((row: any) => ({
        bucket: row.bucket,
        clicks: Number(row.clicks),
        uniqueVisitors: Number(row.unique_visitors),
      })),
      byHour: hourTotals,
      byWeekday: weekdayTotals,
      heatmap: heatmap.map((row: any) => ({
        weekday: Number(row.weekday),
        hour: Number(row.hour),
        clicks: Number(row.clicks),
      })),
      byLink: byLink.map((row: any) => ({
        alias: row.alias,
        url: row.url,
        activo: row.activo,
        clicks: Number(row.clicks),
        uniqueVisitors: Number(row.unique_visitors),
        lastClick: row.last_click,
        share: matchingClicks ? Number(((Number(row.clicks) / matchingClicks) * 100).toFixed(1)) : 0,
      })),
      breakdowns,
      clicks,
      page: filter.page,
      pageSize: filter.pageSize,
      totalPages: Math.max(1, Math.ceil(matchingClicks / filter.pageSize)),
      filterOptions: (filterOptions as any[]).map((row) => row.value),
      linkOptions,
      applied: {
        field: filter.field,
        value: filter.value ?? '',
        alias: filter.alias ?? '',
        status: filter.status,
        dateFrom: filter.dateFrom ?? '',
        dateTo: filter.dateTo ?? '',
        hourFrom: filter.hourFrom ?? null,
        hourTo: filter.hourTo ?? null,
        weekdays: filter.weekdays,
        period: filter.period,
        timeZone: filter.timeZone,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Ejecuta una consulta construyendo el WHERE con parámetros propios. */
  private run(
    userId: string,
    filter: NormalizedFilter,
    build: (where: string, params: SqlParams) => string,
  ): Promise<any[]> {
    const params = new SqlParams();
    const where = this.buildWhere(userId, filter, params);
    const sql = build(where, params);
    return this.db.query<any[]>(sql, params.values as any[]);
  }

  private buildWhere(userId: string, filter: NormalizedFilter, p: SqlParams): string {
    const conditions: string[] = [`l.user_id = ${p.add(userId)}`];

    if (filter.status === 'active') conditions.push('l.activo = true');
    if (filter.status === 'inactive') conditions.push('l.activo = false');
    if (filter.alias) conditions.push(`l.alias = ${p.add(filter.alias)}`);

    const needsLocal =
      filter.dateFrom ||
      filter.dateTo ||
      filter.hourFrom !== undefined ||
      filter.hourTo !== undefined ||
      filter.weekdays.length > 0;

    if (needsLocal) {
      const tz = `${p.add(filter.timeZone)}::text`;
      const local = `(v.created_at AT TIME ZONE ${tz})`;

      // Se compara contra created_at (timestamptz) para aprovechar índices.
      if (filter.dateFrom) {
        conditions.push(`v.created_at >= (${p.add(filter.dateFrom)}::date::timestamp AT TIME ZONE ${tz})`);
      }
      if (filter.dateTo) {
        conditions.push(`v.created_at < ((${p.add(filter.dateTo)}::date + 1)::timestamp AT TIME ZONE ${tz})`);
      }

      const hour = `EXTRACT(HOUR FROM ${local})::int`;
      if (filter.hourFrom !== undefined && filter.hourTo !== undefined) {
        const from = p.add(filter.hourFrom);
        const to = p.add(filter.hourTo);
        // Si from > to (ej. 22 → 3) se interpreta como horario nocturno.
        conditions.push(
          filter.hourFrom <= filter.hourTo
            ? `${hour} BETWEEN ${from} AND ${to}`
            : `(${hour} >= ${from} OR ${hour} <= ${to})`,
        );
      } else if (filter.hourFrom !== undefined) {
        conditions.push(`${hour} >= ${p.add(filter.hourFrom)}`);
      } else if (filter.hourTo !== undefined) {
        conditions.push(`${hour} <= ${p.add(filter.hourTo)}`);
      }

      if (filter.weekdays.length) {
        conditions.push(`EXTRACT(ISODOW FROM ${local})::int = ANY(${p.add(filter.weekdays)}::int[])`);
      }
    }

    if (filter.value) {
      const like = p.add(`%${filter.value}%`);
      if (filter.field === 'all') {
        const any = Object.values(FIELD_COLUMNS)
          .map((column) => `COALESCE(${column}, '') ILIKE ${like}`)
          .join(' OR ');
        conditions.push(`(${any})`);
      } else {
        conditions.push(`COALESCE(${FIELD_COLUMNS[filter.field]}, '') ILIKE ${like}`);
      }
    }

    return conditions.join(' AND ');
  }

  private normalize(raw: GlobalClickFilter): NormalizedFilter {
    const field = raw.field?.trim() || 'all';
    if (field !== 'all' && !FIELD_COLUMNS[field]) {
      throw new BadRequestException('Campo de filtro no válido');
    }

    const period = (raw.period?.trim() || 'day') as GlobalPeriod;
    if (!['hour', 'day', 'week', 'month'].includes(period)) {
      throw new BadRequestException('El periodo debe ser hour, day, week o month');
    }

    const status = (raw.status?.trim() || 'all') as LinkStatusFilter;
    if (!['all', 'active', 'inactive'].includes(status)) {
      throw new BadRequestException('El estado debe ser all, active o inactive');
    }

    const timeZone = raw.timeZone?.trim() || 'UTC';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      throw new BadRequestException('La zona horaria no es válida');
    }

    const dateFrom = this.validateDate(raw.dateFrom);
    const dateTo = this.validateDate(raw.dateTo);
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('La fecha inicial debe ser anterior o igual a la fecha final');
    }

    const weekdays = (raw.weekdays ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const day = Number(item);
        if (!Number.isInteger(day) || day < 1 || day > 7) {
          throw new BadRequestException('Los días de la semana deben estar entre 1 (lunes) y 7 (domingo)');
        }
        return day;
      });

    return {
      field,
      value: raw.value?.trim() || undefined,
      alias: raw.alias?.trim() || undefined,
      status,
      page: Math.max(1, Math.floor(Number(raw.page) || 1)),
      pageSize: Math.min(100, Math.max(1, Math.floor(Number(raw.limit) || 25))),
      dateFrom,
      dateTo,
      hourFrom: this.validateHour(raw.hourFrom),
      hourTo: this.validateHour(raw.hourTo),
      weekdays: [...new Set(weekdays)].sort(),
      period,
      timeZone,
    };
  }

  private validateDate(value?: string): string | undefined {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('La fecha debe usar el formato YYYY-MM-DD');
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('La fecha no es válida');
    }
    return value;
  }

  private validateHour(value?: string): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const hour = Number(value);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new BadRequestException('La hora debe estar entre 0 y 23');
    }
    return hour;
  }

  /** Rango inmediatamente anterior con la misma cantidad de días. */
  private previousRange(dateFrom?: string, dateTo?: string) {
    if (!dateFrom || !dateTo) return null;
    const dayMs = 24 * 60 * 60 * 1000;
    const from = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
    const to = new Date(`${dateTo}T00:00:00.000Z`).getTime();
    const days = Math.round((to - from) / dayMs) + 1;
    const prevTo = new Date(from - dayMs);
    const prevFrom = new Date(from - days * dayMs);
    return {
      from: prevFrom.toISOString().slice(0, 10),
      to: prevTo.toISOString().slice(0, 10),
    };
  }
}
