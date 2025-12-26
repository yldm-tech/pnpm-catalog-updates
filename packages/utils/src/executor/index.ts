/**
 * Command Executor Module
 *
 * Provides unified command execution utilities for the entire codebase.
 */

export {
  buildSafeCommand,
  type CommandOptions,
  type CommandResult,
  escapeShellArg,
  executeCommand,
  executeCommandSync,
  getCommandVersion,
  whichCommand,
} from './commandExecutor.js'
