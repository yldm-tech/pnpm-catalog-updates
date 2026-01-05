/**
 * Check Command
 *
 * CLI command to check for outdated catalog dependencies.
 * Provides detailed information about available updates.
 */

import type {
  CatalogUpdateInfo,
  CatalogUpdateService,
  CheckOptions,
  OutdatedDependencyInfo,
  OutdatedReport,
} from '@pcu/core'
import { countUpdateTypesFromCatalogs } from '@pcu/core'
import { CommandExitError, t } from '@pcu/utils'
import type { OutputFormat } from '../formatters/outputFormatter.js'
import { StyledText, ThemeManager } from '../themes/colorTheme.js'
import { cliOutput } from '../utils/cliOutput.js'
import {
  getEffectivePatterns,
  getEffectiveTarget,
  handleCommandError,
  initializeCommand,
  mergeWithConfig,
} from '../utils/commandHelpers.js'
import { errorsOnly, validateCheckOptions } from '../validators/index.js'

export interface CheckCommandOptions {
  workspace?: string
  catalog?: string
  format?: OutputFormat
  target?: 'latest' | 'greatest' | 'minor' | 'patch' | 'newest'
  prerelease?: boolean
  include?: string[]
  exclude?: string[]
  verbose?: boolean
  color?: boolean
  exitCode?: boolean
  /** Skip security vulnerability checks */
  noSecurity?: boolean
}

export class CheckCommand {
  constructor(private readonly catalogUpdateService: CatalogUpdateService) {}

  /**
   * Execute the check command
   */
  async execute(options: CheckCommandOptions = {}): Promise<void> {
    try {
      // Initialize command with shared helper (theme, config, formatter)
      const { config, formatter } = await initializeCommand(options, {
        showVerboseInfo: true,
        verboseInfo: {
          [t('command.check.catalogLabel', { catalog: '' }).replace(': ', '')]:
            options.catalog || undefined,
          [t('command.check.targetLabel', { target: '' }).replace(': ', '')]:
            options.target && options.target !== 'latest' ? options.target : undefined,
        },
      })

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
        noSecurity: options.noSecurity,
      }

      // Execute check
      const report = await this.catalogUpdateService.checkOutdatedDependencies(checkOptions)

      // Format and display results
      const formattedOutput = formatter.formatOutdatedReport(report)
      cliOutput.print(formattedOutput)

      // Show summary
      if (options.verbose || options.format === 'table') {
        this.showSummary(report, options)
      }

      // Exit with code 1 if --exit-code is set and updates are available (for CI/CD)
      if (options.exitCode && report.hasUpdates) {
        throw CommandExitError.failure('Updates available')
      }

      // Otherwise exit with 0 since this is just a check command
      throw CommandExitError.success()
    } catch (error) {
      // Re-throw CommandExitError as-is (success or controlled exit)
      if (error instanceof CommandExitError) {
        throw error
      }

      // QUAL-007: Use unified error handling
      handleCommandError(error, {
        verbose: options.verbose,
        errorMessage: 'Check dependencies failed',
        context: { options },
        errorDisplayKey: 'command.check.errorChecking',
      })
      throw CommandExitError.failure('Check command failed')
    }
  }

  /**
   * Show command summary
   */
  private showSummary(report: OutdatedReport, _options: CheckCommandOptions): void {
    const lines: string[] = []
    const theme = ThemeManager.getTheme()

    if (!report.hasUpdates) {
      lines.push(StyledText.iconSuccess(t('info.noUpdatesFound')))
    } else {
      lines.push(StyledText.iconInfo(`${t('command.check.summary')}:`))
      lines.push(`  • ${t('info.foundOutdated', { count: report.totalOutdated })}`)
      lines.push(`  • ${t('command.check.catalogsChecked', { count: report.catalogs.length })}`)

      const totalPackages = report.catalogs.reduce(
        (sum: number, cat: CatalogUpdateInfo) => sum + cat.totalPackages,
        0
      )
      lines.push(`  • ${t('command.check.totalCatalogEntries', { count: totalPackages })}`)

      // Show breakdown by update type
      const updateTypes = countUpdateTypesFromCatalogs(report.catalogs)

      if (updateTypes.major > 0) {
        lines.push(
          theme.major(`  • ${t('command.check.majorUpdates', { count: updateTypes.major })}`)
        )
      }
      if (updateTypes.minor > 0) {
        lines.push(
          theme.minor(`  • ${t('command.check.minorUpdates', { count: updateTypes.minor })}`)
        )
      }
      if (updateTypes.patch > 0) {
        lines.push(
          theme.patch(`  • ${t('command.check.patchUpdates', { count: updateTypes.patch })}`)
        )
      }

      // Security updates
      const securityUpdates = report.catalogs.reduce((sum: number, cat: CatalogUpdateInfo) => {
        return (
          sum +
          cat.outdatedDependencies.filter((dep: OutdatedDependencyInfo) => dep.isSecurityUpdate)
            .length
        )
      }, 0)

      if (securityUpdates > 0) {
        lines.push(StyledText.iconSecurity(t('info.securityUpdates', { count: securityUpdates })))
      }

      lines.push('')
      lines.push(StyledText.iconUpdate(t('info.runWithUpdate')))

      if (updateTypes.major > 0) {
        lines.push(StyledText.iconWarning(t('info.majorWarning')))
      }
    }

    cliOutput.print(lines.join('\n'))
  }

  /**
   * Validate command options
   * QUAL-002: Uses unified validator from validators/
   */
  static validateOptions(options: CheckCommandOptions): string[] {
    return errorsOnly(validateCheckOptions)(options)
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Check for outdated catalog dependencies

Usage:
  pcu check [options]

Options:
  --workspace <path>     Workspace directory (default: current directory)
  --catalog <name>       Check specific catalog only
  --format <type>        Output format: table, json, yaml, minimal (default: table)
  --target <type>        Update target: latest, greatest, minor, patch, newest (default: latest)
  --prerelease           Include prerelease versions
  --include <pattern>    Include packages matching pattern (can be used multiple times)
  --exclude <pattern>    Exclude packages matching pattern (can be used multiple times)
  --verbose              Show detailed information
  --no-color             Disable colored output

Examples:
  pcu check                           # Check all catalogs
  pcu check --catalog react17        # Check specific catalog
  pcu check --target minor           # Check for minor updates only
  pcu check --format json            # Output as JSON
  pcu check --include "react*"       # Include only React packages
  pcu check --exclude "@types/*"     # Exclude TypeScript types

Exit Codes:
  0  All dependencies are up to date
  1  Updates are available
  2  Error occurred
    `
  }
}
