/**
 * Package Manager Service
 *
 * Abstraction layer for package manager operations (pnpm, npm, yarn).
 * Provides testable interface for package manager commands.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { logger } from '@pcu/utils'

/**
 * Result of a package manager command execution
 */
export interface PackageManagerResult {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  error?: Error
}

/**
 * Options for package manager commands
 */
export interface PackageManagerOptions {
  /** Working directory for the command */
  cwd: string
  /** Whether to show verbose output */
  verbose?: boolean
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number
}

/**
 * Interface for package manager operations
 * Allows for testing and potential support for other package managers
 */
export interface IPackageManagerService {
  /**
   * Run install command to update lock file and node_modules
   */
  install(options: PackageManagerOptions): Promise<PackageManagerResult>

  /**
   * Get the package manager name
   */
  getName(): string
}

/**
 * PNPM implementation of the package manager service
 */
export class PnpmPackageManagerService implements IPackageManagerService {
  private readonly defaultTimeout = 5 * 60 * 1000 // 5 minutes

  getName(): string {
    return 'pnpm'
  }

  async install(options: PackageManagerOptions): Promise<PackageManagerResult> {
    return this.executeCommand(['install'], options)
  }

  /**
   * Execute a pnpm command with the given arguments
   */
  private async executeCommand(
    args: string[],
    options: PackageManagerOptions
  ): Promise<PackageManagerResult> {
    const timeout = options.timeout ?? this.defaultTimeout

    return new Promise((resolve) => {
      let pnpmProcess: ChildProcess
      let timeoutId: NodeJS.Timeout | undefined

      try {
        pnpmProcess = spawn('pnpm', args, {
          cwd: options.cwd,
          stdio: options.verbose ? 'inherit' : 'pipe',
        })
      } catch (error) {
        logger.error('Failed to spawn pnpm process', error instanceof Error ? error : undefined)
        resolve({
          success: false,
          code: null,
          stdout: '',
          stderr: '',
          error: error instanceof Error ? error : new Error(String(error)),
        })
        return
      }

      let stdout = ''
      let stderr = ''

      // Only capture output if not in verbose mode
      if (!options.verbose && pnpmProcess.stdout) {
        pnpmProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString()
        })
      }

      if (!options.verbose && pnpmProcess.stderr) {
        pnpmProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })
      }

      // Set up timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          logger.warn('pnpm command timed out', { args, timeout })
          pnpmProcess.kill('SIGTERM')
          resolve({
            success: false,
            code: null,
            stdout,
            stderr,
            error: new Error(`Command timed out after ${timeout}ms`),
          })
        }, timeout)
      }

      pnpmProcess.on('close', (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        if (code === 0) {
          logger.debug('pnpm command succeeded', { args })
          resolve({
            success: true,
            code: 0,
            stdout,
            stderr,
          })
        } else {
          logger.warn('pnpm command failed', { args, code, stderr })
          resolve({
            success: false,
            code,
            stdout,
            stderr,
          })
        }
      })

      pnpmProcess.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        logger.error('pnpm command error', error)
        resolve({
          success: false,
          code: null,
          stdout,
          stderr,
          error,
        })
      })
    })
  }
}
