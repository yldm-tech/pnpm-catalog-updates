/**
 * Process Exit Utility
 *
 * ARCH-002: Centralized process exit handling for better testability.
 * Instead of calling process.exit directly throughout the codebase,
 * use this utility which can be mocked in tests.
 */

/**
 * Exit handler function type
 */
export type ExitHandler = (code: number) => never

/**
 * Default exit handler - calls process.exit
 */
const defaultExitHandler: ExitHandler = (code: number): never => {
  process.exit(code)
}

/**
 * Current exit handler - can be replaced for testing
 */
let currentExitHandler: ExitHandler = defaultExitHandler

/**
 * Exit the process with the given code.
 * This function is designed to be mockable in tests.
 *
 * @param code - Exit code (0 for success, non-zero for failure)
 */
export function exitProcess(code: number): never {
  return currentExitHandler(code)
}

/**
 * Set a custom exit handler (useful for testing)
 *
 * @param handler - Custom exit handler function
 */
export function setExitHandler(handler: ExitHandler): void {
  currentExitHandler = handler
}

/**
 * Reset to the default exit handler
 */
export function resetExitHandler(): void {
  currentExitHandler = defaultExitHandler
}

/**
 * Get the current exit handler (useful for testing)
 */
export function getExitHandler(): ExitHandler {
  return currentExitHandler
}
