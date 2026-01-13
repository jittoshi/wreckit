export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  json(data: unknown): void;
}

export interface LoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
  noColor?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(options?: LoggerOptions): Logger {
  const { verbose = false, quiet = false, noColor = false } = options ?? {};

  const minLevel = quiet ? LOG_LEVELS.error : verbose ? LOG_LEVELS.debug : LOG_LEVELS.info;

  const colors = {
    debug: noColor ? '' : '\x1b[90m',
    info: noColor ? '' : '\x1b[36m',
    warn: noColor ? '' : '\x1b[33m',
    error: noColor ? '' : '\x1b[31m',
    reset: noColor ? '' : '\x1b[0m',
  };

  const shouldLog = (level: LogLevel): boolean => LOG_LEVELS[level] >= minLevel;

  const formatMessage = (level: LogLevel, message: string): string => {
    const prefix = level === 'debug' ? '[debug] ' : level === 'warn' ? '[warn] ' : level === 'error' ? '[error] ' : '';
    return `${colors[level]}${prefix}${message}${colors.reset}`;
  };

  return {
    debug(message: string, ...args: unknown[]): void {
      if (shouldLog('debug')) {
        console.log(formatMessage('debug', message), ...args);
      }
    },
    info(message: string, ...args: unknown[]): void {
      if (shouldLog('info')) {
        console.log(formatMessage('info', message), ...args);
      }
    },
    warn(message: string, ...args: unknown[]): void {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', message), ...args);
      }
    },
    error(message: string, ...args: unknown[]): void {
      if (shouldLog('error')) {
        console.error(formatMessage('error', message), ...args);
      }
    },
    json(data: unknown): void {
      console.log(JSON.stringify(data));
    },
  };
}

export let logger: Logger = createLogger();

export function setLogger(l: Logger): void {
  logger = l;
}

export function initLogger(options?: LoggerOptions): Logger {
  const l = createLogger(options);
  setLogger(l);
  return l;
}
