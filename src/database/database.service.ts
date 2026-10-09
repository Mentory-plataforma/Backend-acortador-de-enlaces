import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.pool = new Pool({
      host: this.configService.get<string>('DB_HOST'),
      port: this.configService.get<number>('DB_PORT'),
      user: this.configService.get<string>('DB_USER'),
      password: this.configService.get<string>('DB_PASSWORD'),
      database: this.configService.get<string>('DB_NAME'),
      ssl: true,
    });

    try {
      await this.pool.query('SELECT 1');
    } catch (error) {
      console.error('Error connecting to database:', error);
    }
  }

  async query<T = any>(text: string, params?: any[]): Promise<T> {
    const start = Date.now();
    const res = await this.pool.query(text, params);
    const duration = Date.now() - start;

    // console.log('executed query', { text, duration, rows: res.rowCount });

    return res.rows as T;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
