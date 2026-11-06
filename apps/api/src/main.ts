import 'reflect-metadata';
import { type INestApplication, Logger, type LogLevel as NestLogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PROJECT_STORE_ROUTE_PREFIX } from '@bbartolome/scriba-contracts/project-store';
import { AppModule } from './app.module.js';
import { runPreListenBoot } from './modules/platform/boot/pre-listen.js';
import { type LogLevel, parseScribaEnv } from './modules/platform/config/env.js';
import { StreamPublisher, useJsonBodyParsers } from './modules/platform/index.js';

/** The JSON limit on the project routes, which carry file content up to the 5 MB cap. */
// provisional: survey 20 §7 item 21
const PROJECT_STORE_BODY_LIMIT = '6mb';
import { installTailnetFilter } from './modules/platform/network/tailnet-filter.js';
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: LEVELS_BY_THRESHOLD[config.logLevel],
    bodyParser: false,
  });
  // provisional: survey 20 §7 item 21 (the 5 MB file cap needs a larger JSON limit on the project routes only)
  useJsonBodyParsers(app, [
    { prefix: PROJECT_STORE_ROUTE_PREFIX, limit: PROJECT_STORE_BODY_LIMIT },
  ]);
  // Before listen, so no connection from a tailnet peer is ever accepted.
  installTailnetFilter(app.getHttpServer());
  const host = listenAll ? ALL_INTERFACES_HOST : LOOPBACK_HOST;
  await app.listen(config.port, host);
  installShutdown(app);

  const web = resolveWebRoot();
  logger.log(
    `Listening on http://${host}:${config.port}; web root ${web.rootPath} (${web.source})`,
  );
}

/**
 * On SIGTERM or SIGINT: end the open streams first, so clients see a clean close, then close the
 * app and exit 0. [proposed] A second signal during shutdown is ignored. A failed close exits 1.
 */
function installShutdown(app: INestApplication): void {
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.log(`${signal} received: ending streams, then closing the app`);
    try {
      app.get(StreamPublisher).closeAll();
      await app.close();
      logger.log('Shut down cleanly');
      process.exit(0);
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(error.message, error.stack);
      } else {
        logger.error(String(error));
      }
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
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
