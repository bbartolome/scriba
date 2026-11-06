import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { registerSettingsSection } from '../platform/index.js';
import { SetupAuthController } from './setup-auth.controller.js';
import { SetupAuthGuard } from './guard.js';
import { registerSetupAuthBoot } from './boot.js';
import { PREFERENCES_SECTION_NAME, SETUP_SECTION_NAME } from './setup/setup-settings.js';
import { PreferencesService } from './setup/preferences.service.js';
import { SetupStatusService } from './setup/setup-status.service.js';

// The pre-listen step and the two settings sections register when this module loads, so they are
// in place before boot runs the migration and before the server listens. Version 1 is the first
// version of each section, so neither has a migration step yet.
registerSetupAuthBoot();
registerSettingsSection({ name: SETUP_SECTION_NAME, steps: {} });
registerSettingsSection({ name: PREFERENCES_SECTION_NAME, steps: {} });

/**
 * The Setup & auth module (survey #18). It installs the global default-deny guard, the token
 * handshake, identity and sign-out, and the setup status and preferences. Its pre-listen step writes
 * the setup URL.
 */
@Module({
  controllers: [SetupAuthController],
  providers: [
    { provide: APP_GUARD, useClass: SetupAuthGuard },
    SetupStatusService,
    PreferencesService,
  ],
})
export class SetupAuthModule {}
