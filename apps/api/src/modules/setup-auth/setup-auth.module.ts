import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SetupAuthController } from './setup-auth.controller.js';
import { SetupAuthGuard } from './guard.js';
import { registerSetupAuthBoot } from './boot.js';

// The pre-listen step registers when this module loads, so it runs before the server listens.
registerSetupAuthBoot();

/**
 * The Setup & auth module (survey #18). It installs the global default-deny guard, the token
 * handshake, identity and sign-out. Its pre-listen step writes the setup URL.
 */
@Module({
  controllers: [SetupAuthController],
  providers: [{ provide: APP_GUARD, useClass: SetupAuthGuard }],
})
export class SetupAuthModule {}
