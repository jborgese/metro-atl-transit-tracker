type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const IS_DEV =
  import.meta.env?.DEV === true ||
  import.meta.env?.MODE === 'test'

function format(scope: string, level: LogLevel, message: string) {
  const ts = new Date().toISOString().split('T')[1]?.replace('Z', '')
  return `[${scope}] ${ts} ${level.toUpperCase()}: ${message}`
}

export function createLogger(scope: string) {
  return {
    debug(message: string, data?: unknown) {
      if (!IS_DEV) return
      data === undefined
        ? console.log(format(scope, 'debug', message))
        : console.log(format(scope, 'debug', message), data)
    },

    info(message: string, data?: unknown) {
      if (!IS_DEV) return
      data === undefined
        ? console.info(format(scope, 'info', message))
        : console.info(format(scope, 'info', message), data)
    },

    warn(message: string, data?: unknown) {
      if (!IS_DEV) return
      data === undefined
        ? console.warn(format(scope, 'warn', message))
        : console.warn(format(scope, 'warn', message), data)
    },

    error(message: string, data?: unknown) {
      // errors should *always* log
      data === undefined
        ? console.error(format(scope, 'error', message))
        : console.error(format(scope, 'error', message), data)
    },
  }
}
