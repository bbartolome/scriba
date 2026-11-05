import 'reflect-metadata';
import { Logger, type LogLevel as NestLogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { runPreListenBoot } from './modules/platform/boot/pre-listen.js';
import { type LogLevel, parseScribaEnv } from './modules/platform/config/env.js';
import { resolveWebRoot } from './modules/platform/static/static.js';

/**
 * [proposed] Owner item 10: bind all interfaces only when this flag is passed. It is a command-line
 * flag, not a SCRIBA_* variable, and the default stays on loopback.
 */
const LISTEN_ALL_FLAG = '--listen-all';
const LOOPBACK_HOST = '127.0.0.1';
/** [proposed] IPv4 wildcard for `--listen-all`. The spec says "all interfaces" without an address. */
const ALL_INTERFACES_HOST = '0.0.0.0';

/** Nest log levels allowed by each SCRIBA_LOG_LEVEL threshold. */
const LEVELS_BY_THRESHOLD: Record<LogLevel, NestLogLevel[]> = {
  debug: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'],
  info: ['fatal', 'error', 'warn', 'log'],
  warn: ['fatal', 'error', 'warn'],
  error: ['fatal', 'error'],
};

const logger = new Logger('Bootstrap');

async function main(): Promise<void> {
  const listenAll = process.argv.slice(2).includes(LISTEN_ALL_FLAG);

  // Spec order: read env, app-state check, settings migration, pre-listen steps, then listen.
  // Any refusal throws before NestFactory.create, so nothing binds a port.
  const config = parseScribaEnv(process.env);
  await runPreListenBoot(config);

  const app = await NestFactory.create(AppModule, {
    logger: LEVELS_BY_THRESHOLD[config.logLevel],
  });
  const host = listenAll ? ALL_INTERFACES_HOST : LOOPBACK_HOST;
  await app.listen(config.port, host);

  const web = resolveWebRoot();
  logger.log(
    `Listening on http://${host}:${config.port}; web root ${web.rootPath} (${web.source})`,
  );
}

main().catch((error: unknown) => {
  // Refusals and failures are logged with their clear messages and exit non-zero.
  if (error instanceof Error) {
    logger.error(error.message, error.name === 'Error' ? error.stack : undefined);
  } else {
    logger.error(String(error));
  }
  process.exitCode = 1;
});
