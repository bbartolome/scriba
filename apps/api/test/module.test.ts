import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppVersionInfoSchema } from '@bbartolome/scriba-contracts/platform';
import { BUILD_INFO } from '../src/modules/platform/config/build-info.js';
import { HealthController } from '../src/modules/platform/controller/health.controller.js';
import { PlatformModule } from '../src/modules/platform/index.js';

describe('PlatformModule wiring', () => {
  it('compiles with the build info provider and the health controller', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PlatformModule] }).compile();

    try {
      expect(AppVersionInfoSchema.parse(moduleRef.get(BUILD_INFO)).version).toBe('0.0.0-dev');
      expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
    } finally {
      await moduleRef.close();
    }
  });
});
