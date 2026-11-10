import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RedirectController } from './redirect.controller';
import { RedirectService } from './redirect.service';

@Module({
  imports: [HttpModule.register({ timeout: 3000, maxRedirects: 0 })],
  controllers: [RedirectController],
  providers: [RedirectService],
})
export class RedirectModule {}
