/**
 * CLI Output Service
 *
 * Provides a unified interface for CLI output, making it easier to test
 * and control output behavior. This separates user-facing output from
 * internal logging (which should use the logger from @pcu/utils).
 *
 * Usage:
 * - Use cliOutput for user-facing messages (formatted, styled)
 * - Use logger from @pcu/utils for internal logging (debug, errors)
 */

/**
 * Interface for CLI output operations
 * Allows mocking in tests without console hijacking
 */
export interface ICliOutput {
  /** Print standard output (user-facing messages) */
  print(...args: unknown[]): void
  /** Print error output (user-facing errors) */
  error(...args: unknown[]): void
  /** Print warning output (user-facing warnings) */
  warn(...args: unknown[]): void
  /** Print info output (alias for print) */
  info(...args: unknown[]): void
}

/**
 * Default CLI output implementation using console
 */
class CliOutputImpl implements ICliOutput {
  print(...args: unknown[]): void {
    console.log(...args)
  }

  error(...args: unknown[]): void {
    console.error(...args)
  }

  warn(...args: unknown[]): void {
    console.warn(...args)
  }

  info(...args: unknown[]): void {
    console.log(...args)
  }
}

/**
 * Singleton instance for CLI output
 * Can be replaced in tests via setCliOutput()
 */
let cliOutputInstance: ICliOutput = new CliOutputImpl()

/**
 * Get the current CLI output instance
 */
export function getCliOutput(): ICliOutput {
  return cliOutputInstance
}

/**
 * Set a custom CLI output instance (useful for testing)
 */
export function setCliOutput(output: ICliOutput): void {
  cliOutputInstance = output
}

/**
 * Reset CLI output to the default implementation
 */
export function resetCliOutput(): void {
  cliOutputInstance = new CliOutputImpl()
}

/**
 * Default CLI output instance for convenience
 */
export const cliOutput: ICliOutput = {
  print: (...args: unknown[]) => cliOutputInstance.print(...args),
  error: (...args: unknown[]) => cliOutputInstance.error(...args),
  warn: (...args: unknown[]) => cliOutputInstance.warn(...args),
  info: (...args: unknown[]) => cliOutputInstance.info(...args),
}

/**
 * Create a mock CLI output for testing
 * Returns the mock and arrays of captured output
 */
export function createMockCliOutput(): {
  mock: ICliOutput
  prints: unknown[][]
  errors: unknown[][]
  warns: unknown[][]
  infos: unknown[][]
  clear: () => void
} {
  const prints: unknown[][] = []
  const errors: unknown[][] = []
  const warns: unknown[][] = []
  const infos: unknown[][] = []

  const mock: ICliOutput = {
    print: (...args: unknown[]) => prints.push(args),
    error: (...args: unknown[]) => errors.push(args),
    warn: (...args: unknown[]) => warns.push(args),
    info: (...args: unknown[]) => infos.push(args),
  }

  const clear = () => {
    prints.length = 0
    errors.length = 0
    warns.length = 0
    infos.length = 0
  }

  return { mock, prints, errors, warns, infos, clear }
}
