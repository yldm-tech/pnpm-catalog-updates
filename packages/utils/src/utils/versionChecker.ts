/**
 * Version Checker Utility
 *
 * Checks for newer versions of the PCU tool and provides update prompts.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { logger } from '../logger/logger.js'

// InteractivePrompts removed - prompting should be handled by CLI layer

const execAsync = promisify(exec)

export interface VersionCheckResult {
  isLatest: boolean
  currentVersion: string
  latestVersion: string
  shouldPrompt: boolean
}

export interface VersionCheckOptions {
  skipPrompt?: boolean
  timeout?: number
  packageName?: string
}

export class VersionChecker {
  private static readonly DEFAULT_TIMEOUT = 5000 // 5 seconds
  private static readonly DEFAULT_PACKAGE = 'pcu'

  /**
   * Check if current version is the latest
   */
  static async checkVersion(
    currentVersion: string,
    options: VersionCheckOptions = {}
  ): Promise<VersionCheckResult> {
    const {
      skipPrompt = false,
      timeout = VersionChecker.DEFAULT_TIMEOUT,
      packageName = VersionChecker.DEFAULT_PACKAGE,
    } = options

    try {
      // Get latest version from npm with timeout
      const latestVersion = await VersionChecker.getLatestVersion(packageName, timeout)

      const isLatest = VersionChecker.compareVersions(currentVersion, latestVersion) >= 0

      return {
        isLatest,
        currentVersion,
        latestVersion,
        shouldPrompt: !isLatest && !skipPrompt,
      }
    } catch (error) {
      // Use logger instead of console.warn, preserve error for debugging
      logger.debug('Failed to check for updates', error instanceof Error ? error : undefined)
      return {
        isLatest: true, // Assume latest if check fails
        currentVersion,
        latestVersion: currentVersion,
        shouldPrompt: false,
      }
    }
  }

  /**
   * Display update notification (no auto-update for security reasons)
   * Users must explicitly run `pcu self-update` to update
   */
  static displayUpdateNotification(versionResult: VersionCheckResult): void {
    if (!versionResult.shouldPrompt) {
      return
    }

    console.log()
    console.log(chalk.cyan('📦 Update Available!'))
    console.log(
      chalk.gray(
        `Current version: ${versionResult.currentVersion} → Latest: ${versionResult.latestVersion}`
      )
    )
    console.log(chalk.gray('Run `pcu self-update` to update to the latest version.'))
    console.log(chalk.gray('Or update manually: npm install -g pcu@latest'))
    console.log()
  }

  /**
   * Display update notification only (no auto-update for security)
   * Returns false to indicate no update was performed
   */
  static async promptAndUpdate(versionResult: VersionCheckResult): Promise<boolean> {
    if (!versionResult.shouldPrompt) {
      return false
    }

    // Only display notification, never auto-update
    // This prevents supply chain attacks from auto-executing install commands
    VersionChecker.displayUpdateNotification(versionResult)
    return false
  }

  /**
   * Perform update without prompting
   */
  static async performUpdateAction(): Promise<boolean> {
    console.log(chalk.blue('🔄 Updating pcu...'))
    try {
      await VersionChecker.performUpdate()
      console.log(chalk.green('✅ Successfully updated! Please restart the command.'))
      return true
    } catch (error) {
      console.error(chalk.red('❌ Update failed:'), error)
      console.log(chalk.gray('You can manually update with: npm install -g pcu@latest'))
      return false
    }
  }

  /**
   * Get latest version from npm registry
   */
  private static async getLatestVersion(packageName: string, timeout: number): Promise<string> {
    const command = `npm view ${packageName} version`

    try {
      const { stdout } = await VersionChecker.executeWithTimeout(command, timeout)
      return stdout.trim()
    } catch (error) {
      // Fallback: try with different npm commands
      try {
        const { stdout } = await VersionChecker.executeWithTimeout(
          `npm info ${packageName} version`,
          timeout
        )
        return stdout.trim()
      } catch (fallbackError) {
        throw new Error(`Failed to get latest version: ${error}`)
      }
    }
  }

  /**
   * Execute update command
   */
  private static async performUpdate(): Promise<void> {
    // Try global update first, then fallback to different methods
    const commands = [
      'npm install -g pcu@latest',
      'npm update -g pcu',
      'pnpm add -g pcu@latest',
      'yarn global add pcu@latest',
    ]

    for (const command of commands) {
      try {
        console.log(chalk.gray(`Executing: ${command}`))
        await execAsync(command, { timeout: 30000 })
        return // Success
      } catch (error) {
        console.warn(chalk.yellow(`Command failed: ${command}`))
        // Continue to next command
      }
    }

    throw new Error('All update commands failed')
  }

  /**
   * Execute command with timeout
   */
  private static async executeWithTimeout(
    command: string,
    timeout: number
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = exec(command, { timeout }, (error, stdout, stderr) => {
        if (error) {
          reject(error)
        } else {
          resolve({ stdout, stderr })
        }
      })

      // Additional timeout handling
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`Command timed out after ${timeout}ms`))
      }, timeout)

      child.on('exit', () => {
        clearTimeout(timer)
      })
    })
  }

  /**
   * Compare two version strings
   * Returns: -1 if a < b, 0 if a === b, 1 if a > b
   */
  private static compareVersions(a: string, b: string): number {
    const cleanA = a.replace(/^v/, '').replace(/[^0-9.]/g, '')
    const cleanB = b.replace(/^v/, '').replace(/[^0-9.]/g, '')

    const partsA = cleanA.split('.').map(Number)
    const partsB = cleanB.split('.').map(Number)

    const maxLength = Math.max(partsA.length, partsB.length)

    for (let i = 0; i < maxLength; i++) {
      const partA = partsA[i] || 0
      const partB = partsB[i] || 0

      if (partA < partB) return -1
      if (partA > partB) return 1
    }

    return 0
  }

  /**
   * Check if running in CI environment where prompts should be skipped
   */
  static isCI(): boolean {
    return !!(
      process.env.CI ||
      process.env.CONTINUOUS_INTEGRATION ||
      process.env.BUILD_NUMBER ||
      process.env.RUN_ID ||
      process.env.GITHUB_ACTIONS
    )
  }

  /**
   * Get update frequency preference from environment
   */
  static shouldCheckForUpdates(): boolean {
    const skipCheck = process.env.PCU_SKIP_VERSION_CHECK
    if (skipCheck === 'true' || skipCheck === '1') {
      return false
    }

    // Skip in CI environments by default
    if (VersionChecker.isCI()) {
      return false
    }

    return true
  }
}
