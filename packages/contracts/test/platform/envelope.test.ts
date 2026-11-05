import { describe, expect, it } from 'vitest';
import {
  EnvelopeBaseSchema,
  PlatformEnvelopeSchema,
  PlatformEchoDataSchema,
  PlatformHelloDataSchema,
} from '../../src/platform/index.js';

const SERVER_TIME = '2026-11-05T22:00:00.000Z';

const validHello = {
  module: 'platform',
  type: 'hello',
  data: { streamId: 'stream-1', version: '0.0.0-dev', serverTime: SERVER_TIME },
};

const validEcho = {
  module: 'platform',
  type: 'echo',
  data: { seq: 1, sentAt: SERVER_TIME },
};

describe('platform envelope', () => {
  it('accepts a valid hello and a valid echo', () => {
    expect(PlatformEnvelopeSchema.safeParse(validHello).success).toBe(true);
    expect(PlatformEnvelopeSchema.safeParse(validEcho).success).toBe(true);
  });

  it('rejects a module outside the publishing enum', () => {
    // `shell` and `genre-packs` publish nothing, so they are not in the enum.
    for (const module of ['shell', 'genre-packs', 'not-a-module']) {
      expect(EnvelopeBaseSchema.safeParse({ ...validHello, module }).success).toBe(false);
    }
    expect(PlatformEnvelopeSchema.safeParse({ ...validEcho, module: 'setup-auth' }).success).toBe(
      false,
    );
  });

  it('rejects a type with a module prefix or a non-kebab-case name', () => {
    expect(EnvelopeBaseSchema.safeParse({ ...validHello, type: 'platform/hello' }).success).toBe(
      false,
    );
    expect(EnvelopeBaseSchema.safeParse({ ...validHello, type: 'Hello' }).success).toBe(false);
  });

  it('rejects an envelope with no data', () => {
    expect(EnvelopeBaseSchema.safeParse({ module: 'platform', type: 'hello' }).success).toBe(false);
  });

  it('rejects hello and echo data with missing or malformed fields', () => {
    expect(PlatformHelloDataSchema.safeParse({ streamId: 's', version: '0.0.0' }).success).toBe(
      false,
    );
    expect(PlatformEchoDataSchema.safeParse({ seq: -1, sentAt: SERVER_TIME }).success).toBe(false);
  });
});
