import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  HOST_EXEMPT_ROUTE_PATHS,
  LOOPBACK_HOSTNAMES,
  LOOPBACK_ORIGIN_SCHEME,
  ORIGIN_EXEMPT_METHODS,
} from '@bbartolome/scriba-contracts/setup-auth';
import { IS_PUBLIC_KEY } from '../../common/public.js';
import { ApiException } from '../platform/index.js';
import { readSessionCookie, verifySession } from './session.js';
import { currentSetupToken } from './state.js';

/**
 * The developer's extra origins, as `host:port` pairs from `SCRIBA_DEV_ORIGINS`. [proposed] Survey
 * #16 §7 item 10 and #18 Q1 are open. They are read here so the dev server's Host and Origin pass.
 */
function devHostPorts(): string[] {
  const raw = process.env['SCRIBA_DEV_ORIGINS'] ?? '';
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0);
}

/** The Host values accepted on this port: loopback names, and the dev pairs. */
function allowedHosts(port: number): ReadonlySet<string> {
  return new Set([...LOOPBACK_HOSTNAMES.map((name) => `${name}:${port}`), ...devHostPorts()]);
}

/** The full Origin values accepted on this port: loopback over http, and the dev pairs over http. */
function allowedOrigins(port: number): ReadonlySet<string> {
  return new Set([
    ...LOOPBACK_HOSTNAMES.map((name) => `${LOOPBACK_ORIGIN_SCHEME}://${name}:${port}`),
    ...devHostPorts().map((pair) => `${LOOPBACK_ORIGIN_SCHEME}://${pair}`),
  ]);
}

/**
 * The global, default-deny guard (survey #18 "The guard"). Every route needs a valid session
 * unless it is marked `@Public()`. Every route except `/healthz` passes the Host check. Every
 * method other than GET, HEAD and OPTIONS passes the full-Origin check. Checks run in that order:
 * Host, Origin, then the credential. The guard fails closed when no setup token is set.
 */
@Injectable()
export class SetupAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const port = request.socket.localPort ?? 0;

    if (!(HOST_EXEMPT_ROUTE_PATHS as readonly string[]).includes(request.path)) {
      const host = request.headers.host ?? '';
      if (!allowedHosts(port).has(host)) {
        throw new ApiException(403, 'AUTH_HOST_REJECTED', 'This Host is not on the allowlist.');
      }
    }

    if (!(ORIGIN_EXEMPT_METHODS as readonly string[]).includes(request.method)) {
      const origin = request.headers.origin;
      if (typeof origin !== 'string' || !allowedOrigins(port).has(origin)) {
        throw new ApiException(403, 'AUTH_ORIGIN_REJECTED', 'This Origin is not allowed.');
      }
    }

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    if (!hasSession(request)) {
      throw new ApiException(401, 'AUTH_REQUIRED', 'Sign in with the setup link.');
    }
    return true;
  }
}

/** True when the request carries a valid, unexpired session for the current setup token. */
export function hasSession(request: Request): boolean {
  const token = currentSetupToken();
  const value = readSessionCookie(request.headers.cookie);
  if (token === undefined || value === undefined) {
    return false;
  }
  return verifySession(value, token, Math.floor(Date.now() / 1000));
}
