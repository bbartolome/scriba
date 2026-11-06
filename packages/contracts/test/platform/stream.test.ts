import { describe, expect, it } from 'vitest';
import {
  ECHO_ROUTE,
  EVENTS_RETRY_MS,
  EVENTS_ROUTE,
  EchoRequestSchema,
  HEARTBEAT_INTERVAL_MS,
} from '../../src/platform/index.js';

describe('stream constants', () => {
  it('match the spec values', () => {
    expect(EVENTS_ROUTE).toBe('/events');
    expect(EVENTS_RETRY_MS).toBe(3000);
    expect(HEARTBEAT_INTERVAL_MS).toBe(15_000);
    expect(ECHO_ROUTE).toBe('/api/platform/echo');
  });
});

describe('echo request', () => {
  it('accepts the spec examples and the bound edges', () => {
    expect(EchoRequestSchema.safeParse({ count: 3, intervalMs: 500 }).success).toBe(true);
    expect(EchoRequestSchema.safeParse({ count: 10, intervalMs: 1000 }).success).toBe(true);
    expect(EchoRequestSchema.safeParse({ count: 1, intervalMs: 0 }).success).toBe(true);
    expect(EchoRequestSchema.safeParse({ count: 100, intervalMs: 10_000 }).success).toBe(true);
  });

  it('rejects count outside its bounds', () => {
    expect(EchoRequestSchema.safeParse({ count: 0, intervalMs: 500 }).success).toBe(false);
    expect(EchoRequestSchema.safeParse({ count: 101, intervalMs: 500 }).success).toBe(false);
    expect(EchoRequestSchema.safeParse({ count: 2.5, intervalMs: 500 }).success).toBe(false);
  });

  it('rejects intervalMs outside its bounds', () => {
    expect(EchoRequestSchema.safeParse({ count: 3, intervalMs: -1 }).success).toBe(false);
    expect(EchoRequestSchema.safeParse({ count: 3, intervalMs: 10_001 }).success).toBe(false);
    expect(EchoRequestSchema.safeParse({ count: 3, intervalMs: 1.5 }).success).toBe(false);
  });
});
