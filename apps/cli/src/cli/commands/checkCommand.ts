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
import { CommandExitError, ConfigLoader, logger, t } from '@pcu/utils'
import { type OutputFormat, OutputFormatter } from '../formatters/outputFormatter.js'
import { StyledText, ThemeManager } from '../themes/colorTheme.js'

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
}

export class CheckCommand {
  constructor(private readonly catalogUpdateService: CatalogUpdateService) {}

  /**
   * Execute the check command
   */
  async execute(options: CheckCommandOptions = {}): Promise<void> {
    try {
      // Initialize theme
      ThemeManager.setTheme('default')

      if (options.verbose) {
        console.log(StyledText.iconAnalysis(t('info.checkingUpdates')))
        console.log(
          StyledText.muted(`${t('command.workspace.title')}: ${options.workspace || process.cwd()}`)
        )

        if (options.catalog) {
          console.log(
            StyledText.muted(t('command.check.catalogLabel', { catalog: options.catalog }))
          )
        }

        if (options.target && options.target !== 'latest') {
          console.log(StyledText.muted(t('command.check.targetLabel', { target: options.target })))
        }

        console.log('')
      }

      // Load configuration file first
      const config = ConfigLoader.loadConfig(options.workspace || process.cwd())

      // Use format from CLI options first, then config file, then default
      const effectiveFormat = options.format || config.defaults?.format || 'table'

      // Create output formatter with effective format
      const formatter = new OutputFormatter(
        effectiveFormat as OutputFormat,
        options.color !== false
      )

      // Merge CLI options with configuration file settings
      const checkOptions: CheckOptions = {
        workspacePath: options.workspace,
        catalogName: options.catalog,
        target: options.target || config.defaults?.target || 'latest',
        includePrerelease: options.prerelease ?? config.defaults?.includePrerelease ?? false,
        // CLI include/exclude options take priority over config file
        include: options.include?.length ? options.include : config.include,
        exclude: options.exclude?.length ? options.exclude : config.exclude,
      }

      // Execute check
      const report = await this.catalogUpdateService.checkOutdatedDependencies(checkOptions)

      // Format and display results
      const formattedOutput = formatter.formatOutdatedReport(report)
      console.log(formattedOutput)

      // Show summary
      if (options.verbose || options.format === 'table') {
        this.showSummary(report, options)
      }

      // Always exit with 0 since this is just a check command
      // and finding updates is not an error condition
      throw CommandExitError.success()
    } catch (error) {
      // Re-throw CommandExitError as-is
      if (error instanceof CommandExitError) {
        throw error
      }

      logger.error('Check dependencies failed', error instanceof Error ? error : undefined, {
        options,
      })
      console.error(StyledText.iconError(t('command.check.errorChecking')))
      console.error(StyledText.error(String(error)))

      if (options.verbose && error instanceof Error) {
        console.error(StyledText.muted(t('common.stackTrace')))
        console.error(StyledText.muted(error.stack || t('common.noStackTrace')))
      }

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
      const updateTypes = { major: 0, minor: 0, patch: 0 }

      for (const catalog of report.catalogs) {
        for (const dep of catalog.outdatedDependencies) {
          updateTypes[dep.updateType as keyof typeof updateTypes]++
        }
      }

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

    console.log(lines.join('\n'))
  }

  /**
   * Validate command options
   */
  static validateOptions(options: CheckCommandOptions): string[] {
    const errors: string[] = []

    // Validate format
    if (options.format && !['table', 'json', 'yaml', 'minimal'].includes(options.format)) {
      errors.push('Invalid format. Must be one of: table, json, yaml, minimal')
    }

    // Validate target
    if (
      options.target &&
      !['latest', 'greatest', 'minor', 'patch', 'newest'].includes(options.target)
    ) {
      errors.push('Invalid target. Must be one of: latest, greatest, minor, patch, newest')
    }

    // Validate include/exclude patterns
    if (options.include?.some((pattern) => !pattern.trim())) {
      errors.push('Include patterns cannot be empty')
    }

    if (options.exclude?.some((pattern) => !pattern.trim())) {
      errors.push('Exclude patterns cannot be empty')
    }

    return errors
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
