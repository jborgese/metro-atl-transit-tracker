// src/logger.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const IS_DEV = Boolean(import.meta.env?.DEV)
export const IS_TEST = import.meta.env?.MODE === 'test'
export const IS_DEV_OR_TEST = IS_DEV || IS_TEST

function format(scope: string, level: LogLevel, message: string) {
  const ts = new Date().toISOString().split('T')[1]?.replace('Z', '')
  return `[${scope}] ${ts} ${level.toUpperCase()}: ${message}`
}

export function createLogger(scope: string) {
  return {
    debug(message: string, data?: unknown) {
      if (!IS_DEV_OR_TEST) return
      data === undefined
        ? console.debug(format(scope, 'debug', message))
        : console.debug(format(scope, 'debug', message), data)
    },

    info(message: string, data?: unknown) {
      if (!IS_DEV_OR_TEST) return
      data === undefined
        ? console.info(format(scope, 'info', message))
        : console.info(format(scope, 'info', message), data)
    },

    warn(message: string, data?: unknown) {
      if (!IS_DEV_OR_TEST) return
      data === undefined
        ? console.warn(format(scope, 'warn', message))
        : console.warn(format(scope, 'warn', message), data)
    },

    error(message: string, data?: unknown) {
      // errors should always log
      data === undefined
        ? console.error(format(scope, 'error', message))
        : console.error(format(scope, 'error', message), data)
    },
  }
}
