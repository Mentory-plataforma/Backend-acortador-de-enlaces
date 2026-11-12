import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { GlobalAnalyticsController } from './global-analytics.controller';
import { GlobalAnalyticsService } from './global-analytics.service';

@Module({
  controllers: [AnalyticsController, GlobalAnalyticsController],
  providers: [AnalyticsService, GlobalAnalyticsService],
})
export class AnalyticsModule {}
