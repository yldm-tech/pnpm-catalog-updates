/**
 * Watch Command
 *
 * CLI command to watch pnpm-workspace.yaml for changes and automatically
 * check for outdated dependencies when modifications are detected.
 */

import path from 'node:path'
import type { CatalogUpdateService, CheckOptions, OutdatedReport } from '@pcu/core'
import { countUpdateTypesFromCatalogs, WatchService } from '@pcu/core'
import { CommandExitError, logger, t } from '@pcu/utils'
import chalk from 'chalk'
import type { OutputFormat } from '../formatters/outputFormatter.js'
import { StyledText } from '../themes/colorTheme.js'
import {
  getEffectivePatterns,
  getEffectiveTarget,
  initializeTheme,
  loadConfiguration,
  mergeWithConfig,
} from '../utils/commandHelpers.js'

export interface WatchCommandOptions {
  workspace?: string
  catalog?: string
  format?: OutputFormat
  target?: 'latest' | 'greatest' | 'minor' | 'patch' | 'newest'
  prerelease?: boolean
  include?: string[]
  exclude?: string[]
  verbose?: boolean
  color?: boolean
  debounce?: number
  clear?: boolean
}

export class WatchCommand {
  private readonly watchService: WatchService
  private checkCount = 0

  constructor(private readonly catalogUpdateService: CatalogUpdateService) {
    this.watchService = new WatchService()
  }

  /**
   * Execute the watch command
   */
  async execute(options: WatchCommandOptions = {}): Promise<void> {
    const workspacePath = options.workspace || process.cwd()
    const workspaceConfigPath = path.join(workspacePath, 'pnpm-workspace.yaml')

    // Initialize theme using shared helper
    initializeTheme('default')

    console.log(chalk.blue(`\n${t('command.watch.starting')}`))
    console.log(chalk.gray(`${t('command.watch.watching')}: ${workspaceConfigPath}`))
    console.log(chalk.gray(t('command.watch.pressCtrlC')))
    console.log(chalk.gray('─'.repeat(60)))

    // Setup graceful shutdown
    const cleanup = () => {
      console.log(chalk.yellow(`\n${t('command.watch.stopping')}`))
      this.watchService.stop()
      console.log(StyledText.iconSuccess(t('command.watch.stopped')))
      process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    try {
      await this.watchService.watch(
        workspaceConfigPath,
        {
          onChange: async () => {
            await this.runCheck(options)
          },
          onError: (error) => {
            logger.error('Watch error', error)
            console.error(StyledText.iconError(`${t('cli.error')} ${error.message}`))
          },
          onStart: () => {
            logger.info('Watch started', { path: workspaceConfigPath })
          },
          onStop: () => {
            logger.info('Watch stopped')
          },
        },
        {
          debounceMs: options.debounce || 300,
          runOnStart: true,
        }
      )

      // Keep the process running
      await new Promise(() => {
        // This promise never resolves - the process runs until interrupted
      })
    } catch (error) {
      logger.error('Watch command failed', error instanceof Error ? error : undefined)

      if (error instanceof Error) {
        console.error(StyledText.iconError(`${t('cli.error')} ${error.message}`))
      } else {
        console.error(StyledText.iconError(t('error.unknown')))
      }
      throw CommandExitError.failure('Watch command failed')
    }
  }

  /**
   * Run check for outdated dependencies
   */
  private async runCheck(options: WatchCommandOptions): Promise<void> {
    this.checkCount++
    const timestamp = new Date().toLocaleTimeString()

    // Clear console if requested
    if (options.clear && this.checkCount > 1) {
      console.clear()
    }

    console.log(
      chalk.cyan(`\n[${timestamp}] ${t('command.watch.checkingUpdates')} (#${this.checkCount})`)
    )
    console.log(chalk.gray('─'.repeat(60)))

    try {
      // Load configuration using shared helper
      const config = await loadConfiguration(options.workspace)

      // Build check options using shared helpers
      const checkOptions: CheckOptions = {
        workspacePath: options.workspace,
        catalogName: options.catalog,
        target: getEffectiveTarget(options.target, config.defaults?.target),
        includePrerelease: mergeWithConfig(
          options.prerelease,
          config.defaults?.includePrerelease,
          false
        ),
        include: getEffectivePatterns(options.include, config.include),
        exclude: getEffectivePatterns(options.exclude, config.exclude),
      }

      // Run check
      const report: OutdatedReport =
        await this.catalogUpdateService.checkOutdatedDependencies(checkOptions)

      // Output results
      if (!report.hasUpdates) {
        console.log(StyledText.iconSuccess(t('info.noUpdatesFound')))
      } else {
        console.log(chalk.yellow(t('command.watch.foundOutdated', { count: report.totalOutdated })))

        // Show summary table
        this.printSummary(report)
      }

      console.log(chalk.gray(`\n${t('command.watch.waitingForChanges')}`))
    } catch (error) {
      logger.error('Check failed during watch', error instanceof Error ? error : undefined)
      console.error(
        StyledText.iconError(error instanceof Error ? error.message : t('error.unknown'))
      )
    }
  }

  /**
   * Print a summary of outdated packages
   */
  private printSummary(report: OutdatedReport): void {
    console.log('')

    // Count update types across all catalogs
    const updateTypes = countUpdateTypesFromCatalogs(report.catalogs)

    if (updateTypes.major > 0) {
      console.log(chalk.red(`  ${t('command.check.majorUpdates', { count: updateTypes.major })}`))
    }
    if (updateTypes.minor > 0) {
      console.log(
        chalk.yellow(`  ${t('command.check.minorUpdates', { count: updateTypes.minor })}`)
      )
    }
    if (updateTypes.patch > 0) {
      console.log(chalk.green(`  ${t('command.check.patchUpdates', { count: updateTypes.patch })}`))
    }

    console.log('')
    console.log(chalk.gray(t('command.watch.runUpdateHint')))
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Watch pnpm-workspace.yaml for changes and check for updates

Usage:
  pcu watch [options]

Options:
  --workspace <path>    Workspace directory (default: current directory)
  --catalog <name>      Check specific catalog only
  --format <type>       Output format: table, json, markdown
  --target <type>       Update target: latest, minor, patch
  --debounce <ms>       Debounce delay in milliseconds (default: 300)
  --clear               Clear console before each check
  --verbose             Show detailed information

Examples:
  pcu watch                    # Watch current directory
  pcu watch --clear            # Clear console on each change
  pcu watch --debounce 1000    # Wait 1 second before checking

Notes:
  - Press Ctrl+C to stop watching
  - Changes are debounced to avoid rapid re-checks
  - Initial check runs when watch starts
    `
  }
}
