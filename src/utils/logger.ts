// src/logger.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const IS_DEV = Boolean(import.meta.env?.DEV)
export const IS_TEST = import.meta.env?.MODE === 'test'
export const IS_DEV_OR_TEST = IS_DEV || IS_TEST

function format(scope: string, level: LogLevel, message: string) {
  const ts = new Date().toISOString().split('T')[1]?.replace('Z', '')
  return `[${scope}] ${ts} ${level.toUpperCase()}: ${message}`
}

function toConsoleArgs(line: string, data: unknown): unknown[] {
  return data === undefined ? [line] : [line, data]
}

export function createLogger(scope: string) {
  return {
    debug(message: string, data?: unknown) {
      if (!IS_DEV_OR_TEST) return
      console.debug(...toConsoleArgs(format(scope, 'debug', message), data))
    },

    info(message: string, data?: unknown) {
      if (!IS_DEV_OR_TEST) return
      console.info(...toConsoleArgs(format(scope, 'info', message), data))
    },

    warn(message: string, data?: unknown) {
      if (!IS_DEV_OR_TEST) return
      console.warn(...toConsoleArgs(format(scope, 'warn', message), data))
    },

    error(message: string, data?: unknown) {
      // errors should always log
      console.error(...toConsoleArgs(format(scope, 'error', message), data))
    },
  }
}
