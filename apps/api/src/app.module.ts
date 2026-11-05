import { Module } from '@nestjs/common';
import { PlatformModule } from './modules/platform/index.js';

/** The root module. Each module adds one import here. */
@Module({
  imports: [PlatformModule],
})
export class AppModule {}
