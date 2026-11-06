import { Module } from '@nestjs/common';
import { PlatformModule } from './modules/platform/index.js';
import { SetupAuthModule } from './modules/setup-auth/setup-auth.module.js';

/** The root module. Each module adds one import here. */
@Module({
  imports: [PlatformModule, SetupAuthModule],
})
export class AppModule {}
