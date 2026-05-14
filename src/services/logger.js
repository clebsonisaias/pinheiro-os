/**
 * logger.js — Wrapper estruturado sobre console.
 *
 * Zero deps, mas adiciona timestamp ISO + level. Substituir por pino se
 * precisar de envio pra Datadog/Loki/etc.
 *
 *   import { log } from './services/logger.js';
 *   log.info('boot', { port: 4000 });
 */

const COR = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[90m', reset: '\x1b[0m' };
const PRETTY = process.env.NODE_ENV !== 'production' && process.stdout.isTTY;

function fmt(level) {
  const sink = console[level === 'info' ? 'log' : level] || console.log;
  return (...args) => {
    const ts = new Date().toISOString();
    if (PRETTY) {
      sink(`${COR[level]}[${ts}] [${level.toUpperCase()}]${COR.reset}`, ...args);
    } else {
      sink(`[${ts}] [${level.toUpperCase()}]`, ...args);
    }
  };
}

export const log = {
  info:  fmt('info'),
  warn:  fmt('warn'),
  error: fmt('error'),
  debug: (process.env.LOG_LEVEL === 'debug') ? fmt('debug') : () => {},
};
