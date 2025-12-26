/**
 * Install Handler
 *
 * Handles package manager install operations for the update command.
 * Extracted from UpdateCommand to reduce class complexity (ARCH-002).
 */

import type { IPackageManagerService } from '@pcu/core'
import { logger, t } from '@pcu/utils'
import chalk from 'chalk'
import { ProgressBar } from '../formatters/progressBar.js'
import { cliOutput } from '../utils/cliOutput.js'

/**
 * Handles package manager install operations after catalog updates
 */
export class InstallHandler {
  private readonly packageManagerService: IPackageManagerService

  constructor(packageManagerService: IPackageManagerService) {
    this.packageManagerService = packageManagerService
  }

  /**
   * Run package manager install to update lock file after catalog updates
   * Uses injected package manager service for testability
   * Enhanced error handling with detailed feedback
   */
  async runInstall(workspacePath: string, verbose?: boolean): Promise<void> {
    const pmName = this.packageManagerService.getName()
    const progressBar = new ProgressBar({
      text: t('command.update.runningPnpmInstall'),
      total: 1,
    })
    progressBar.start(t('command.update.runningPnpmInstall'))

    try {
      const result = await this.packageManagerService.install({
        cwd: workspacePath,
        verbose,
      })

      if (result.success) {
        progressBar.succeed(t('command.update.pnpmInstallSuccess'))
      } else {
        this.handleInstallFailure(result, pmName, progressBar, verbose)
      }
    } catch (error) {
      // Handle unexpected errors (e.g., spawn errors, permission issues)
      progressBar.fail(t('command.update.pnpmInstallFailed'))
      this.logInstallError(error, pmName)
    }
  }

  /**
   * Handle install command failure with detailed feedback
   */
  private handleInstallFailure(
    result: Awaited<ReturnType<IPackageManagerService['install']>>,
    pmName: string,
    progressBar: ProgressBar,
    verbose?: boolean
  ): void {
    progressBar.fail(t('command.update.pnpmInstallFailed'))

    // Show stderr if available and verbose mode enabled or short output
    if (result.stderr) {
      const stderrLines = result.stderr.split('\n').filter((line) => line.trim())
      const displayLines = verbose ? stderrLines : stderrLines.slice(-5)
      if (displayLines.length > 0) {
        cliOutput.error(chalk.gray(`\n${displayLines.join('\n')}`))
        if (!verbose && stderrLines.length > 5) {
          cliOutput.error(
            chalk.gray(
              `  ... (${t('command.update.moreLines', { count: stderrLines.length - 5 })})`
            )
          )
        }
      }
    }

    // Provide helpful suggestions based on exit code
    this.suggestInstallFix(result.code, pmName)

    // Log for debugging - don't throw since catalog update succeeded
    logger.warn(`${pmName} install failed`, {
      code: result.code,
      stderr: result.stderr?.slice(0, 500),
      error: result.error?.message,
    })
  }

  /**
   * Suggest fixes for common install failures
   * Enhanced error handling with actionable suggestions
   */
  private suggestInstallFix(exitCode: number | null, pmName: string): void {
    cliOutput.print(chalk.yellow(`\n💡 ${t('command.update.suggestFix')}`))

    if (exitCode === 1) {
      // Generic failure - likely dependency conflict
      cliOutput.print(
        chalk.gray(`   - ${t('command.update.suggestManualInstall', { pm: pmName })}`)
      )
      cliOutput.print(chalk.gray(`   - ${t('command.update.suggestCheckDeps')}`))
    } else if (exitCode === 127) {
      // Command not found
      cliOutput.print(chalk.gray(`   - ${t('command.update.suggestInstallPm', { pm: pmName })}`))
    } else if (exitCode === null) {
      // Timeout or signal
      cliOutput.print(chalk.gray(`   - ${t('command.update.suggestRetry')}`))
      cliOutput.print(chalk.gray(`   - ${t('command.update.suggestCheckNetwork')}`))
    } else {
      // Other exit codes
      cliOutput.print(
        chalk.gray(`   - ${t('command.update.suggestManualInstall', { pm: pmName })}`)
      )
    }
  }

  /**
   * Log unexpected install errors
   */
  private logInstallError(error: unknown, pmName: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error)
    cliOutput.error(chalk.red(`\n${t('command.update.installError')}: ${errorMessage}`))

    logger.error(`Unexpected ${pmName} install error`, error instanceof Error ? error : undefined)
  }
}
