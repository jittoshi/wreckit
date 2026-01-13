import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, initLogger, setLogger, logger } from '../logging';
import {
  WreckitError,
  InterruptedError,
  toExitCode,
  wrapError,
  isWreckitError,
  ConfigError,
} from '../errors';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('default logger', () => {
    it('shows info, warn, error but not debug', () => {
      const log = createLogger({ noColor: true });

      log.debug('debug message');
      log.info('info message');
      log.warn('warn message');
      log.error('error message');

      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('debug message'));
      expect(consoleLogSpy).toHaveBeenCalledWith('info message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[warn] warn message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[error] error message');
    });
  });

  describe('verbose mode', () => {
    it('shows debug messages when verbose=true', () => {
      const log = createLogger({ verbose: true, noColor: true });

      log.debug('debug message');
      log.info('info message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[debug] debug message');
      expect(consoleLogSpy).toHaveBeenCalledWith('info message');
    });
  });

  describe('quiet mode', () => {
    it('only shows errors when quiet=true', () => {
      const log = createLogger({ quiet: true, noColor: true });

      log.debug('debug message');
      log.info('info message');
      log.warn('warn message');
      log.error('error message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('[error] error message');
    });
  });

  describe('json output', () => {
    it('outputs valid JSON', () => {
      const log = createLogger();
      const data = { foo: 'bar', num: 42, nested: { a: 1 } };

      log.json(data);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(data));
    });
  });

  describe('initLogger', () => {
    it('creates and sets a global logger', () => {
      const originalLogger = logger;
      const newLogger = initLogger({ verbose: true });

      expect(newLogger).toBeDefined();
      expect(newLogger).not.toBe(originalLogger);

      setLogger(originalLogger);
    });
  });
});

describe('Error exit codes', () => {
  it('toExitCode(null) returns 0', () => {
    expect(toExitCode(null)).toBe(0);
  });

  it('toExitCode(undefined) returns 0', () => {
    expect(toExitCode(undefined)).toBe(0);
  });

  it('toExitCode(new WreckitError()) returns 1', () => {
    expect(toExitCode(new WreckitError('test', 'TEST'))).toBe(1);
  });

  it('toExitCode(new ConfigError()) returns 1', () => {
    expect(toExitCode(new ConfigError('config issue'))).toBe(1);
  });

  it('toExitCode(new InterruptedError()) returns 130', () => {
    expect(toExitCode(new InterruptedError())).toBe(130);
  });

  it('toExitCode(new Error("SIGINT")) returns 130', () => {
    expect(toExitCode(new Error('SIGINT'))).toBe(130);
  });

  it('toExitCode(new Error("interrupted")) returns 130', () => {
    expect(toExitCode(new Error('Operation was interrupted'))).toBe(130);
  });

  it('toExitCode(new Error("random")) returns 1', () => {
    expect(toExitCode(new Error('random error'))).toBe(1);
  });

  it('toExitCode with non-error returns 1', () => {
    expect(toExitCode('string error')).toBe(1);
    expect(toExitCode(42)).toBe(1);
    expect(toExitCode({})).toBe(1);
  });
});

describe('wrapError', () => {
  it('wraps Error with context', () => {
    const original = new Error('original message');
    const wrapped = wrapError(original, 'Failed to load');

    expect(wrapped).toBeInstanceOf(WreckitError);
    expect(wrapped.message).toBe('Failed to load: original message');
    expect(wrapped.code).toBe('WRAPPED_ERROR');
  });

  it('wraps WreckitError with context preserving code', () => {
    const original = new ConfigError('bad config');
    const wrapped = wrapError(original, 'Initialization failed');

    expect(wrapped).toBeInstanceOf(WreckitError);
    expect(wrapped.message).toBe('Initialization failed: bad config');
    expect(wrapped.code).toBe('CONFIG_ERROR');
  });

  it('wraps string with context', () => {
    const wrapped = wrapError('something went wrong', 'Operation failed');

    expect(wrapped).toBeInstanceOf(WreckitError);
    expect(wrapped.message).toBe('Operation failed: something went wrong');
    expect(wrapped.code).toBe('WRAPPED_ERROR');
  });
});

describe('isWreckitError', () => {
  it('returns true for WreckitError', () => {
    expect(isWreckitError(new WreckitError('test', 'TEST'))).toBe(true);
  });

  it('returns true for WreckitError subclasses', () => {
    expect(isWreckitError(new ConfigError('test'))).toBe(true);
    expect(isWreckitError(new InterruptedError())).toBe(true);
  });

  it('returns false for regular Error', () => {
    expect(isWreckitError(new Error('test'))).toBe(false);
  });

  it('returns false for non-errors', () => {
    expect(isWreckitError('string')).toBe(false);
    expect(isWreckitError(null)).toBe(false);
    expect(isWreckitError(undefined)).toBe(false);
    expect(isWreckitError({})).toBe(false);
  });
});
