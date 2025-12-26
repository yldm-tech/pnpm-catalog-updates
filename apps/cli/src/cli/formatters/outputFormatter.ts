/**
 * Output Formatter
 *
 * Provides formatted output for CLI commands in various formats.
 * Supports table, JSON, YAML, minimal, and CI/CD output formats.
 * CI formats include GitHub Actions, GitLab CI, JUnit XML, and SARIF.
 */

import type {
  AnalysisResult,
  ImpactAnalysis,
  OutdatedReport,
  UpdatePlan,
  UpdateResult,
  WorkspaceInfo,
  WorkspaceStats,
  WorkspaceValidationReport,
} from '@pcu/core'
import { countUpdateTypes } from '@pcu/core'
import { t } from '@pcu/utils'
import chalk from 'chalk'
import Table from 'cli-table3'
import YAML from 'yaml'
import type { SecurityReport } from '../commands/securityCommand.js'
import { CIFormatter, type CIOutputFormat } from './ciFormatter.js'

export type OutputFormat =
  | 'table'
  | 'json'
  | 'yaml'
  | 'minimal'
  | 'github'
  | 'gitlab'
  | 'junit'
  | 'sarif'

export type CIFormat = 'github' | 'gitlab' | 'junit' | 'sarif'

export function isCIFormat(format: OutputFormat): format is CIFormat {
  return ['github', 'gitlab', 'junit', 'sarif'].includes(format)
}

// Build ANSI escape regex without literal control characters
const ANSI_ESCAPE = String.fromCharCode(27)
const ansiRegex: RegExp = new RegExp(`${ANSI_ESCAPE}\\[[0-9;]*m`, 'g')

export class OutputFormatter {
  private ciFormatter: CIFormatter | null = null

  constructor(
    private readonly format: OutputFormat = 'table',
    private readonly useColor: boolean = true
  ) {}

  /**
   * Get or create CIFormatter instance for CI output formats
   */
  private getCIFormatter(): CIFormatter {
    if (!this.ciFormatter) {
      this.ciFormatter = new CIFormatter(this.format as CIOutputFormat)
    }
    return this.ciFormatter
  }

  /**
   * Format outdated dependencies report
   */
  formatOutdatedReport(report: OutdatedReport): string {
    // Delegate to CIFormatter for CI output formats
    if (isCIFormat(this.format)) {
      return this.getCIFormatter().formatOutdatedReport(report)
    }

    switch (this.format) {
      case 'json':
        return JSON.stringify(report, null, 2)
      case 'yaml':
        return YAML.stringify(report)
      case 'minimal':
        return this.formatOutdatedMinimal(report)
      default:
        return this.formatOutdatedTable(report)
    }
  }

  /**
   * Format update result
   */
  formatUpdateResult(result: UpdateResult): string {
    // Delegate to CIFormatter for CI output formats
    if (isCIFormat(this.format)) {
      return this.getCIFormatter().formatUpdateResult(result)
    }

    switch (this.format) {
      case 'json':
        return JSON.stringify(result, null, 2)
      case 'yaml':
        return YAML.stringify(result)
      case 'minimal':
        return this.formatUpdateMinimal(result)
      default:
        return this.formatUpdateTable(result)
    }
  }

  /**
   * Format update plan (for dry-run mode)
   */
  formatUpdatePlan(plan: UpdatePlan): string {
    // Delegate to CIFormatter for CI output formats
    if (isCIFormat(this.format)) {
      return this.getCIFormatter().formatUpdatePlan(plan)
    }

    switch (this.format) {
      case 'json':
        return JSON.stringify(plan, null, 2)
      case 'yaml':
        return YAML.stringify(plan)
      case 'minimal':
        return this.formatUpdatePlanMinimal(plan)
      default:
        return this.formatUpdatePlanTable(plan)
    }
  }

  /**
   * Format impact analysis
   */
  formatImpactAnalysis(analysis: ImpactAnalysis): string {
    switch (this.format) {
      case 'json':
        return JSON.stringify(analysis, null, 2)
      case 'yaml':
        return YAML.stringify(analysis)
      case 'minimal':
        return this.formatImpactMinimal(analysis)
      default:
        return this.formatImpactTable(analysis)
    }
  }

  /**
   * Format workspace validation report
   */
  formatValidationReport(report: WorkspaceValidationReport): string {
    // Delegate to CIFormatter for CI output formats
    if (isCIFormat(this.format)) {
      return this.getCIFormatter().formatValidationReport(report)
    }

    switch (this.format) {
      case 'json':
        return JSON.stringify(report, null, 2)
      case 'yaml':
        return YAML.stringify(report)
      case 'minimal':
        return this.formatValidationMinimal(report)
      default:
        return this.formatValidationTable(report)
    }
  }

  /**
   * Format workspace information
   */
  formatWorkspaceInfo(info: WorkspaceInfo): string {
    switch (this.format) {
      case 'json':
        return JSON.stringify(info, null, 2)
      case 'yaml':
        return YAML.stringify(info)
      case 'minimal':
        return this.formatWorkspaceInfoMinimal(info)
      default:
        return this.formatWorkspaceInfoTable(info)
    }
  }

  /**
   * Format workspace statistics
   */
  formatWorkspaceStats(stats: WorkspaceStats): string {
    switch (this.format) {
      case 'json':
        return JSON.stringify(stats, null, 2)
      case 'yaml':
        return YAML.stringify(stats)
      case 'minimal':
        return this.formatStatsMinimal(stats)
      default:
        return this.formatStatsTable(stats)
    }
  }

  /**
   * Format security report
   */
  formatSecurityReport(report: SecurityReport): string {
    // Delegate to CIFormatter for CI output formats
    if (isCIFormat(this.format)) {
      return this.getCIFormatter().formatSecurityReport(report)
    }

    switch (this.format) {
      case 'json':
        return JSON.stringify(report, null, 2)
      case 'yaml':
        return YAML.stringify(report)
      case 'minimal':
        return this.formatSecurityMinimal(report)
      default:
        return this.formatSecurityTable(report)
    }
  }

  /**
   * Format simple message with optional styling
   */
  formatMessage(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): string {
    if (!this.useColor) {
      return message
    }

    switch (type) {
      case 'success':
        return chalk.green(message)
      case 'error':
        return chalk.red(message)
      case 'warning':
        return chalk.yellow(message)
      default:
        return chalk.blue(message)
    }
  }

  /**
   * Format outdated dependencies as table
   */
  private formatOutdatedTable(report: OutdatedReport): string {
    const lines: string[] = []

    // Header
    lines.push(this.colorize(chalk.bold, `\n${t('format.workspace')}: ${report.workspace.name}`))
    lines.push(this.colorize(chalk.gray, `${t('format.path')}: ${report.workspace.path}`))

    if (!report.hasUpdates) {
      lines.push(this.colorize(chalk.green, `\n✅ ${t('format.allUpToDate')}`))
      return lines.join('\n')
    }

    lines.push(
      this.colorize(
        chalk.yellow,
        `\n${t('format.foundOutdated', { count: String(report.totalOutdated) })}\n`
      )
    )

    for (const catalogInfo of report.catalogs) {
      if (catalogInfo.outdatedCount === 0) continue

      lines.push(this.colorize(chalk.bold, `${t('format.catalog')}: ${catalogInfo.catalogName}`))

      const table = new Table({
        head: this.colorizeHeaders([
          t('table.header.package'),
          t('table.header.current'),
          t('table.header.latest'),
          t('table.header.type'),
          t('table.header.packagesCount'),
        ]),
        style: { head: [], border: [] },
        colWidths: [25, 15, 15, 8, 20],
      })

      for (const dep of catalogInfo.outdatedDependencies) {
        const typeColor = this.getUpdateTypeColor(dep.updateType)
        const securityIcon = dep.isSecurityUpdate ? '[SEC] ' : ''

        // Colorize version differences
        const { currentColored, latestColored } = this.colorizeVersionDiff(
          dep.currentVersion,
          dep.latestVersion,
          dep.updateType
        )

        table.push([
          `${securityIcon}${dep.packageName}`,
          currentColored,
          latestColored,
          this.colorize(typeColor, dep.updateType),
          t('common.packagesCount', { count: String(dep.affectedPackages.length) }),
        ])
      }

      lines.push(table.toString())
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Format outdated dependencies minimally (npm-check-updates style)
   */
  private formatOutdatedMinimal(report: OutdatedReport): string {
    if (!report.hasUpdates) {
      return t('format.allUpToDate')
    }

    // Collect all dependencies first to calculate max package name width
    const allDeps: Array<{
      securityIcon: string
      packageName: string
      currentColored: string
      latestColored: string
    }> = []

    for (const catalogInfo of report.catalogs) {
      for (const dep of catalogInfo.outdatedDependencies) {
        const securityIcon = dep.isSecurityUpdate ? '[SEC] ' : ''
        const { currentColored, latestColored } = this.colorizeVersionDiff(
          dep.currentVersion,
          dep.latestVersion,
          dep.updateType
        )
        allDeps.push({
          securityIcon,
          packageName: dep.packageName,
          currentColored,
          latestColored,
        })
      }
    }

    // Calculate max widths for alignment
    const maxNameWidth = Math.max(
      ...allDeps.map((dep) => (dep.securityIcon + dep.packageName).length)
    )

    // Calculate max version widths (need to strip color codes for accurate width calculation)
    const stripAnsi = (str: string) => str.replace(ansiRegex, '')
    const maxCurrentWidth = Math.max(...allDeps.map((dep) => stripAnsi(dep.currentColored).length))

    // Format lines with proper alignment
    const lines: string[] = []
    for (const dep of allDeps) {
      const nameWithIcon = dep.securityIcon + dep.packageName
      const paddedName = nameWithIcon.padEnd(maxNameWidth)

      // For current version alignment, we need to pad the visible text, not the colored version
      const currentVisible = stripAnsi(dep.currentColored)
      const currentPadding = maxCurrentWidth - currentVisible.length
      const paddedCurrent = dep.currentColored + ' '.repeat(currentPadding)

      lines.push(`${paddedName}  ${paddedCurrent} → ${dep.latestColored}`)
    }

    return lines.join('\n')
  }

  /**
   * Format update result as table
   */
  private formatUpdateTable(result: UpdateResult): string {
    const lines: string[] = []

    // Header
    lines.push(this.colorize(chalk.bold, `\n${t('format.workspace')}: ${result.workspace.name}`))

    if (result.success) {
      lines.push(this.colorize(chalk.green, `✅ ${t('format.updateCompleted')}`))
    } else {
      lines.push(this.colorize(chalk.red, `❌ ${t('format.updateFailed')}`))
    }

    lines.push('')

    // Updated dependencies
    if (result.updatedDependencies.length > 0) {
      lines.push(
        this.colorize(
          chalk.green,
          `${t('format.updatedCount', { count: String(result.totalUpdated) })}:`
        )
      )

      const table = new Table({
        head: this.colorizeHeaders([
          t('table.header.catalog'),
          t('table.header.package'),
          t('table.header.from'),
          t('table.header.to'),
          t('table.header.type'),
        ]),
        style: { head: [], border: [] },
        colWidths: [15, 25, 15, 15, 8],
      })

      for (const dep of result.updatedDependencies) {
        const typeColor = this.getUpdateTypeColor(dep.updateType)

        // Colorize version differences
        const { currentColored, latestColored } = this.colorizeVersionDiff(
          dep.fromVersion,
          dep.toVersion,
          dep.updateType
        )

        table.push([
          dep.catalogName,
          dep.packageName,
          currentColored,
          latestColored,
          this.colorize(typeColor, dep.updateType),
        ])
      }

      lines.push(table.toString())
      lines.push('')
    }

    // Skipped dependencies
    if (result.skippedDependencies.length > 0) {
      lines.push(
        this.colorize(chalk.yellow, `⚠️ ${t('format.skippedDeps')} (${result.totalSkipped}):`)
      )

      for (const dep of result.skippedDependencies) {
        lines.push(`  ${dep.catalogName}:${dep.packageName} - ${dep.reason}`)
      }
      lines.push('')
    }

    // Errors
    if (result.errors.length > 0) {
      lines.push(
        this.colorize(
          chalk.red,
          `❌ ${t('format.errorCount', { count: String(result.totalErrors) })}:`
        )
      )

      for (const error of result.errors) {
        const prefix = error.fatal ? '!!' : '⚠️'
        lines.push(`  ${prefix} ${error.catalogName}:${error.packageName} - ${error.error}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Format update result minimally (npm-check-updates style)
   */
  private formatUpdateMinimal(result: UpdateResult): string {
    const lines: string[] = []

    if (result.success) {
      lines.push(t('format.updatedCount', { count: String(result.totalUpdated) }))
    } else {
      lines.push(t('format.errorCount', { count: String(result.totalErrors) }))
    }

    if (result.updatedDependencies.length > 0) {
      // Collect version info for alignment calculation
      const depsWithVersions = result.updatedDependencies.map((dep) => {
        const { currentColored, latestColored } = this.colorizeVersionDiff(
          dep.fromVersion,
          dep.toVersion,
          dep.updateType
        )
        return {
          packageName: dep.packageName,
          currentColored,
          latestColored,
        }
      })

      // Calculate max widths for alignment
      const maxNameWidth = Math.max(...depsWithVersions.map((dep) => dep.packageName.length))

      const stripAnsi = (str: string) => str.replace(ansiRegex, '')
      const maxCurrentWidth = Math.max(
        ...depsWithVersions.map((dep) => stripAnsi(dep.currentColored).length)
      )

      for (const dep of depsWithVersions) {
        const paddedName = dep.packageName.padEnd(maxNameWidth)

        // Pad current version for alignment
        const currentVisible = stripAnsi(dep.currentColored)
        const currentPadding = maxCurrentWidth - currentVisible.length
        const paddedCurrent = dep.currentColored + ' '.repeat(currentPadding)

        lines.push(`${paddedName}  ${paddedCurrent} → ${dep.latestColored}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Format update plan as table (for dry-run mode)
   */
  private formatUpdatePlanTable(plan: UpdatePlan): string {
    const lines: string[] = []

    // Header
    lines.push(this.colorize(chalk.bold, `\n${t('format.workspace')}: ${plan.workspace.name}`))
    lines.push(this.colorize(chalk.gray, `${t('format.path')}: ${plan.workspace.path}`))

    if (plan.totalUpdates === 0) {
      lines.push(this.colorize(chalk.green, `\n✅ ${t('format.noUpdatesPlanned')}`))
      return lines.join('\n')
    }

    lines.push(
      this.colorize(
        chalk.cyan,
        `\n${t('format.plannedUpdates', { count: String(plan.totalUpdates) })}`
      )
    )
    lines.push('')

    // Updates table
    if (plan.updates.length > 0) {
      const table = new Table({
        head: this.colorizeHeaders([
          t('table.header.catalog'),
          t('table.header.package'),
          t('table.header.current'),
          t('table.header.new'),
          t('table.header.type'),
        ]),
        style: { head: [], border: [] },
        colWidths: [15, 30, 15, 15, 8],
      })

      for (const update of plan.updates) {
        const typeColor = this.getUpdateTypeColor(update.updateType)
        const { currentColored, latestColored } = this.colorizeVersionDiff(
          update.currentVersion,
          update.newVersion,
          update.updateType
        )

        table.push([
          update.catalogName,
          update.packageName,
          currentColored,
          latestColored,
          this.colorize(typeColor, update.updateType),
        ])
      }

      lines.push(table.toString())
      lines.push('')
    }

    // Conflicts warning
    if (plan.hasConflicts && plan.conflicts.length > 0) {
      lines.push(this.colorize(chalk.yellow, `⚠️ ${t('format.versionConflicts')}:`))
      lines.push('')

      for (const conflict of plan.conflicts) {
        lines.push(this.colorize(chalk.bold, `  ${conflict.packageName}:`))
        for (const catalog of conflict.catalogs) {
          lines.push(
            `    ${catalog.catalogName}: ${catalog.currentVersion} → ${catalog.proposedVersion}`
          )
        }
        if (conflict.recommendation) {
          lines.push(
            this.colorize(
              chalk.gray,
              `    ${t('format.recommendation')}: ${conflict.recommendation}`
            )
          )
        }
        lines.push('')
      }
    }

    // Summary breakdown
    const updateTypes = countUpdateTypes(plan.updates)

    lines.push(this.colorize(chalk.bold, `${t('format.summary')}:`))
    if (updateTypes.major > 0) {
      lines.push(
        this.colorize(
          chalk.red,
          `  • ${t('command.check.majorUpdates', { count: String(updateTypes.major) })}`
        )
      )
    }
    if (updateTypes.minor > 0) {
      lines.push(
        this.colorize(
          chalk.yellow,
          `  • ${t('command.check.minorUpdates', { count: String(updateTypes.minor) })}`
        )
      )
    }
    if (updateTypes.patch > 0) {
      lines.push(
        this.colorize(
          chalk.green,
          `  • ${t('command.check.patchUpdates', { count: String(updateTypes.patch) })}`
        )
      )
    }

    return lines.join('\n')
  }

  /**
   * Format update plan minimally (for dry-run mode)
   */
  private formatUpdatePlanMinimal(plan: UpdatePlan): string {
    if (plan.totalUpdates === 0) {
      return t('format.noUpdatesPlanned')
    }

    // Collect update info for alignment calculation
    const updatesWithVersions = plan.updates.map((update) => {
      const { currentColored, latestColored } = this.colorizeVersionDiff(
        update.currentVersion,
        update.newVersion,
        update.updateType
      )
      return {
        packageName: update.packageName,
        currentColored,
        latestColored,
      }
    })

    // Calculate max widths for alignment
    const maxNameWidth = Math.max(...updatesWithVersions.map((u) => u.packageName.length))

    const stripAnsi = (str: string) => str.replace(ansiRegex, '')
    const maxCurrentWidth = Math.max(
      ...updatesWithVersions.map((u) => stripAnsi(u.currentColored).length)
    )

    const lines: string[] = []
    for (const update of updatesWithVersions) {
      const paddedName = update.packageName.padEnd(maxNameWidth)

      // Pad current version for alignment
      const currentVisible = stripAnsi(update.currentColored)
      const currentPadding = maxCurrentWidth - currentVisible.length
      const paddedCurrent = update.currentColored + ' '.repeat(currentPadding)

      lines.push(`${paddedName}  ${paddedCurrent} → ${update.latestColored}`)
    }

    // Add conflicts warning if any
    if (plan.hasConflicts && plan.conflicts.length > 0) {
      lines.push('')
      lines.push(`⚠️ ${plan.conflicts.length} ${t('format.conflictsDetected')}`)
    }

    return lines.join('\n')
  }

  /**
   * Format impact analysis as table
   */
  private formatImpactTable(analysis: ImpactAnalysis): string {
    const lines: string[] = []

    // Header
    lines.push(
      this.colorize(chalk.bold, `\n${t('format.impactAnalysis')}: ${analysis.packageName}`)
    )
    lines.push(this.colorize(chalk.gray, `${t('format.catalog')}: ${analysis.catalogName}`))
    lines.push(
      this.colorize(
        chalk.gray,
        `${t('format.updateInfo')}: ${analysis.currentVersion} → ${analysis.proposedVersion}`
      )
    )
    lines.push(this.colorize(chalk.gray, `${t('table.header.type')}: ${analysis.updateType}`))

    // Risk level
    const riskColor = this.getRiskColor(analysis.riskLevel)
    lines.push(
      this.colorize(riskColor, `${t('format.riskLevel')}: ${analysis.riskLevel.toUpperCase()}`)
    )
    lines.push('')

    // Affected packages
    if (analysis.affectedPackages.length > 0) {
      lines.push(this.colorize(chalk.bold, `${t('format.affectedPackages')}:`))

      const table = new Table({
        head: this.colorizeHeaders([
          t('table.header.package'),
          t('table.header.path'),
          t('table.header.dependencyType'),
          t('table.header.risk'),
        ]),
        style: { head: [], border: [] },
        colWidths: [20, 30, 15, 10],
      })

      for (const pkg of analysis.affectedPackages) {
        const riskColor = this.getRiskColor(pkg.compatibilityRisk)
        table.push([
          pkg.packageName,
          pkg.packagePath,
          pkg.dependencyType,
          this.colorize(riskColor, pkg.compatibilityRisk),
        ])
      }

      lines.push(table.toString())
      lines.push('')
    }

    // Security impact
    if (analysis.securityImpact.hasVulnerabilities) {
      lines.push(this.colorize(chalk.bold, `${t('format.securityImpact')}:`))

      if (analysis.securityImpact.fixedVulnerabilities > 0) {
        lines.push(
          this.colorize(
            chalk.green,
            `  ✅ ${t('format.fixesVulns', { count: String(analysis.securityImpact.fixedVulnerabilities) })}`
          )
        )
      }

      if (analysis.securityImpact.newVulnerabilities > 0) {
        lines.push(
          this.colorize(
            chalk.red,
            `  ⚠️ ${t('format.introducesVulns', { count: String(analysis.securityImpact.newVulnerabilities) })}`
          )
        )
      }

      lines.push('')
    }

    // Recommendations
    if (analysis.recommendations.length > 0) {
      lines.push(this.colorize(chalk.bold, `${t('format.recommendations')}:`))
      for (const rec of analysis.recommendations) {
        lines.push(`  ${rec}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Format impact analysis minimally
   */
  private formatImpactMinimal(analysis: ImpactAnalysis): string {
    return [
      `${analysis.packageName}: ${analysis.currentVersion} → ${analysis.proposedVersion}`,
      `${t('format.riskLevel')}: ${analysis.riskLevel}`,
      `${t('format.affectedPackages')}: ${analysis.affectedPackages.length} ${t('format.packages')}`,
    ].join('\n')
  }

  /**
   * Format validation report as table
   */
  private formatValidationTable(report: WorkspaceValidationReport): string {
    const lines: string[] = []

    // Header
    const statusIcon = report.isValid ? '✅' : '❌'
    const statusColor = report.isValid ? chalk.green : chalk.red

    lines.push(this.colorize(chalk.bold, `\n${statusIcon} ${t('format.workspaceValidation')}`))
    lines.push(
      this.colorize(
        statusColor,
        `${t('format.status')}: ${report.isValid ? t('format.valid') : t('format.invalid')}`
      )
    )
    lines.push('')

    // Workspace info
    lines.push(this.colorize(chalk.bold, `${t('format.workspaceInfo')}:`))
    lines.push(`  ${t('format.path')}: ${report.workspace.path}`)
    lines.push(`  ${t('format.name')}: ${report.workspace.name}`)
    lines.push(`  ${t('format.packages')}: ${report.workspace.packageCount}`)
    lines.push(`  ${t('format.catalogs')}: ${report.workspace.catalogCount}`)
    lines.push('')

    // Errors
    if (report.errors.length > 0) {
      lines.push(this.colorize(chalk.red, `❌ ${t('format.errors')}:`))
      for (const error of report.errors) {
        lines.push(`  • ${error}`)
      }
      lines.push('')
    }

    // Warnings
    if (report.warnings.length > 0) {
      lines.push(this.colorize(chalk.yellow, `⚠️ ${t('format.warnings')}:`))
      for (const warning of report.warnings) {
        lines.push(`  • ${warning}`)
      }
      lines.push('')
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push(this.colorize(chalk.blue, `${t('format.recommendations')}:`))
      for (const rec of report.recommendations) {
        lines.push(`  • ${rec}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Format validation report minimally
   */
  private formatValidationMinimal(report: WorkspaceValidationReport): string {
    const status = report.isValid ? t('format.valid') : t('format.invalid')
    const errors = report.errors.length
    const warnings = report.warnings.length

    return `${status} (${errors} ${t('format.errors')}, ${warnings} ${t('format.warnings')})`
  }

  /**
   * Format workspace information as beautiful table
   */
  private formatWorkspaceInfoTable(info: WorkspaceInfo): string {
    const lines: string[] = []

    // Use cli-table3 for reliable alignment
    const table = new Table({
      chars: {
        top: '─',
        'top-mid': '┬',
        'top-left': '╭',
        'top-right': '╮',
        bottom: '─',
        'bottom-mid': '┴',
        'bottom-left': '╰',
        'bottom-right': '╯',
        left: '│',
        'left-mid': '├',
        mid: '─',
        'mid-mid': '┼',
        right: '│',
        'right-mid': '┤',
        middle: '│',
      },
      style: {
        head: [],
        border: this.useColor ? ['cyan'] : [],
        'padding-left': 1,
        'padding-right': 1,
      },
      colWidths: [20, 55],
      wordWrap: true,
    })

    // Header row
    table.push([
      {
        colSpan: 2,
        content: this.colorize(chalk.bold.cyan, 'WORKSPACE'),
        hAlign: 'center',
      },
    ])

    // Status icon (default to valid if not specified)
    const isValid = info.isValid ?? true
    const statusIcon = isValid ? this.colorize(chalk.green, '✓') : this.colorize(chalk.red, '✗')
    const statusText = isValid
      ? this.colorize(chalk.green, 'Valid')
      : this.colorize(chalk.red, 'Invalid')

    // Data rows - clean, no emojis
    table.push([this.colorize(chalk.gray, 'Name'), this.colorize(chalk.bold.white, info.name)])

    table.push([this.colorize(chalk.gray, 'Path'), this.colorize(chalk.dim, info.path)])

    table.push([this.colorize(chalk.gray, 'Status'), `${statusIcon} ${statusText}`])

    table.push([
      this.colorize(chalk.gray, 'Packages'),
      this.colorize(info.packageCount > 0 ? chalk.green : chalk.yellow, String(info.packageCount)),
    ])

    table.push([
      this.colorize(chalk.gray, 'Catalogs'),
      this.colorize(info.catalogCount > 0 ? chalk.green : chalk.yellow, String(info.catalogCount)),
    ])

    const catalogNames = info.catalogNames ?? []
    if (catalogNames.length > 0) {
      const catalogTags = catalogNames
        .map((name: string) => this.colorize(chalk.cyan, name))
        .join(this.colorize(chalk.gray, ', '))

      table.push([this.colorize(chalk.gray, 'Catalog Names'), catalogTags])
    }

    lines.push('')
    lines.push(table.toString())
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Format workspace information minimally
   */
  private formatWorkspaceInfoMinimal(info: WorkspaceInfo): string {
    const lines: string[] = []
    lines.push(`${info.name} (${info.path})`)
    lines.push(
      `${t('command.workspace.packages')}: ${info.packageCount}, ${t('command.workspace.catalogs')}: ${info.catalogCount}`
    )
    if (info.catalogNames && info.catalogNames.length > 0) {
      lines.push(`${t('command.workspace.catalogNames')}: ${info.catalogNames.join(', ')}`)
    }
    return lines.join('\n')
  }

  /**
   * Format workspace statistics as table
   */
  private formatStatsTable(stats: WorkspaceStats): string {
    const lines: string[] = []

    lines.push(this.colorize(chalk.bold, `\n${t('format.workspaceStatistics')}`))
    lines.push(this.colorize(chalk.gray, `${t('format.workspace')}: ${stats.workspace.name}`))
    lines.push('')

    const table = new Table({
      head: this.colorizeHeaders([t('table.header.metric'), t('table.header.count')]),
      style: { head: [], border: [] },
      colWidths: [30, 10],
    })

    table.push([t('stats.totalPackages'), stats.packages.total.toString()])
    table.push([
      t('stats.packagesWithCatalogRefs'),
      stats.packages.withCatalogReferences.toString(),
    ])
    table.push([t('stats.totalCatalogs'), stats.catalogs.total.toString()])
    table.push([t('stats.catalogEntries'), stats.catalogs.totalEntries.toString()])
    table.push([t('stats.totalDependencies'), stats.dependencies.total.toString()])
    table.push([t('stats.catalogReferences'), stats.dependencies.catalogReferences.toString()])
    table.push([t('stats.dependencies'), stats.dependencies.byType.dependencies.toString()])
    table.push([t('stats.devDependencies'), stats.dependencies.byType.devDependencies.toString()])
    table.push([t('stats.peerDependencies'), stats.dependencies.byType.peerDependencies.toString()])
    table.push([
      t('stats.optionalDependencies'),
      stats.dependencies.byType.optionalDependencies.toString(),
    ])

    lines.push(table.toString())

    return lines.join('\n')
  }

  /**
   * Format workspace statistics minimally
   */
  private formatStatsMinimal(stats: WorkspaceStats): string {
    return [
      `${t('format.packages')}: ${stats.packages.total}`,
      `${t('format.catalogs')}: ${stats.catalogs.total}`,
      `${t('stats.totalDependencies')}: ${stats.dependencies.total}`,
    ].join(', ')
  }

  /**
   * Format security report as table
   */
  private formatSecurityTable(report: SecurityReport): string {
    const lines: string[] = []

    // Header
    lines.push(this.colorize(chalk.bold, `\n${t('format.securityReport')}`))
    lines.push(
      this.colorize(chalk.gray, `${t('format.workspace')}: ${report.metadata.workspacePath}`)
    )
    lines.push(
      this.colorize(
        chalk.gray,
        `${t('format.scanDate')}: ${new Date(report.metadata.scanDate).toLocaleString()}`
      )
    )
    lines.push(
      this.colorize(chalk.gray, `${t('format.tools')}: ${report.metadata.scanTools.join(', ')}`)
    )

    // Summary
    lines.push('')
    lines.push(this.colorize(chalk.bold, `${t('format.summary')}:`))

    const summaryTable = new Table({
      head: this.colorizeHeaders([t('table.header.severity'), t('table.header.count')]),
      style: { head: [], border: [] },
      colWidths: [15, 10],
    })

    summaryTable.push([
      t('severity.critical'),
      this.colorize(chalk.red, report.summary.critical.toString()),
    ])
    summaryTable.push([
      t('severity.high'),
      this.colorize(chalk.yellow, report.summary.high.toString()),
    ])
    summaryTable.push([
      t('severity.moderate'),
      this.colorize(chalk.blue, report.summary.moderate.toString()),
    ])
    summaryTable.push([
      t('severity.low'),
      this.colorize(chalk.green, report.summary.low.toString()),
    ])
    summaryTable.push([
      t('severity.info'),
      this.colorize(chalk.gray, report.summary.info.toString()),
    ])
    summaryTable.push([
      t('severity.total'),
      this.colorize(chalk.bold, report.summary.totalVulnerabilities.toString()),
    ])

    lines.push(summaryTable.toString())

    // Vulnerabilities
    if (report.vulnerabilities.length > 0) {
      lines.push('')
      lines.push(this.colorize(chalk.bold, `${t('format.vulnerabilities')}:`))

      const vulnTable = new Table({
        head: this.colorizeHeaders([
          t('table.header.package'),
          t('table.header.severity'),
          t('table.header.title'),
          t('table.header.fixAvailable'),
        ]),
        style: { head: [], border: [] },
        colWidths: [20, 12, 40, 15],
      })

      for (const vuln of report.vulnerabilities) {
        const severityColor = this.getSeverityColor(vuln.severity)
        const fixStatus = vuln.fixAvailable
          ? typeof vuln.fixAvailable === 'string'
            ? vuln.fixAvailable
            : t('common.yes')
          : t('common.no')

        vulnTable.push([
          vuln.package,
          this.colorize(severityColor, vuln.severity.toUpperCase()),
          vuln.title.length > 35 ? `${vuln.title.substring(0, 35)}...` : vuln.title,
          fixStatus,
        ])
      }

      lines.push(vulnTable.toString())
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('')
      lines.push(this.colorize(chalk.bold, `${t('format.recommendations')}:`))

      for (const rec of report.recommendations) {
        lines.push(`  ${rec.package}: ${rec.currentVersion} → ${rec.recommendedVersion}`)
        lines.push(`    ${rec.reason} (${rec.impact})`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Format security report minimally
   */
  private formatSecurityMinimal(report: SecurityReport): string {
    const vulnerabilities = report.summary.totalVulnerabilities
    if (vulnerabilities === 0) {
      return t('format.noVulnsFound')
    }

    return [
      `${t('format.vulnerabilities')}: ${vulnerabilities}`,
      `  ${t('severity.critical')}: ${report.summary.critical}`,
      `  ${t('severity.high')}: ${report.summary.high}`,
      `  ${t('severity.moderate')}: ${report.summary.moderate}`,
      `  ${t('severity.low')}: ${report.summary.low}`,
    ].join('\n')
  }

  /**
   * Get color for severity level
   */
  private getSeverityColor(severity: string): typeof chalk {
    switch (severity.toLowerCase()) {
      case 'critical':
        return chalk.red
      case 'high':
        return chalk.yellow
      case 'moderate':
        return chalk.blue
      case 'low':
        return chalk.green
      default:
        return chalk.gray
    }
  }

  /**
   * Apply color if color is enabled
   */
  private colorize(colorFn: typeof chalk, text: string): string {
    return this.useColor ? colorFn(text) : text
  }

  /**
   * Colorize table headers
   */
  private colorizeHeaders(headers: string[]): string[] {
    return this.useColor ? headers.map((h) => chalk.bold.cyan(h)) : headers
  }

  /**
   * Get color for update type
   */
  private getUpdateTypeColor(updateType: string): typeof chalk {
    switch (updateType) {
      case 'major':
        return chalk.red
      case 'minor':
        return chalk.yellow
      case 'patch':
        return chalk.green
      default:
        return chalk.gray
    }
  }

  /**
   * Colorize version differences between current and latest
   */
  private colorizeVersionDiff(
    current: string,
    latest: string,
    updateType: string
  ): {
    currentColored: string
    latestColored: string
  } {
    if (!this.useColor) {
      return { currentColored: current, latestColored: latest }
    }

    // Parse version numbers to identify different parts
    const parseVersion = (version: string) => {
      // Remove leading ^ or ~ or other prefix characters
      const cleanVersion = version.replace(/^[\^~>=<]+/, '')
      const parts = cleanVersion.split('.')
      return {
        major: parts[0] || '0',
        minor: parts[1] || '0',
        patch: parts[2] || '0',
        extra: parts.slice(3).join('.'),
        prefix: version.substring(0, version.length - cleanVersion.length),
      }
    }

    const currentParts = parseVersion(current)
    const latestParts = parseVersion(latest)

    // Determine color based on update type for highlighting differences
    const diffColor = this.getUpdateTypeColor(updateType)

    // Build colored version strings by comparing each part
    const colorCurrentPart = (part: string, latestPart: string, isChanged: boolean) => {
      if (isChanged && part !== latestPart) {
        return chalk.dim.white(part) // Dim white for old version part
      }
      return chalk.white(part) // Unchanged parts in white
    }

    const colorLatestPart = (part: string, currentPart: string, isChanged: boolean) => {
      if (isChanged && part !== currentPart) {
        return diffColor(part) // Highlight the new version part with update type color
      }
      return chalk.white(part) // Unchanged parts in white
    }

    // Check which parts are different
    const majorChanged = currentParts.major !== latestParts.major
    const minorChanged = currentParts.minor !== latestParts.minor
    const patchChanged = currentParts.patch !== latestParts.patch
    const extraChanged = currentParts.extra !== latestParts.extra

    // Build colored current version
    let currentColored = currentParts.prefix
    currentColored += colorCurrentPart(currentParts.major, latestParts.major, majorChanged)
    currentColored += '.'
    currentColored += colorCurrentPart(currentParts.minor, latestParts.minor, minorChanged)
    currentColored += '.'
    currentColored += colorCurrentPart(currentParts.patch, latestParts.patch, patchChanged)
    if (currentParts.extra) {
      currentColored += `.${colorCurrentPart(currentParts.extra, latestParts.extra, extraChanged)}`
    }

    // Build colored latest version
    let latestColored = latestParts.prefix
    latestColored += colorLatestPart(latestParts.major, currentParts.major, majorChanged)
    latestColored += '.'
    latestColored += colorLatestPart(latestParts.minor, currentParts.minor, minorChanged)
    latestColored += '.'
    latestColored += colorLatestPart(latestParts.patch, currentParts.patch, patchChanged)
    if (latestParts.extra) {
      latestColored += `.${colorLatestPart(latestParts.extra, currentParts.extra, extraChanged)}`
    }

    return { currentColored, latestColored }
  }

  /**
   * Format AI analysis result
   */
  formatAIAnalysis(aiResult: AnalysisResult, basicAnalysis?: ImpactAnalysis): string {
    switch (this.format) {
      case 'json':
        return JSON.stringify({ aiAnalysis: aiResult, basicAnalysis }, null, 2)
      case 'yaml':
        return YAML.stringify({ aiAnalysis: aiResult, basicAnalysis })
      case 'minimal':
        return this.formatAIAnalysisMinimal(aiResult)
      default:
        return this.formatAIAnalysisTable(aiResult, basicAnalysis)
    }
  }

  /**
   * Format AI analysis as table
   */
  private formatAIAnalysisTable(aiResult: AnalysisResult, basicAnalysis?: ImpactAnalysis): string {
    const lines: string[] = []

    // Header with provider info
    const providerColor = this.useColor ? chalk.cyan : (s: string) => s
    const headerColor = this.useColor ? chalk.bold.white : (s: string) => s
    const successColor = this.useColor ? chalk.green : (s: string) => s
    const warningColor = this.useColor ? chalk.yellow : (s: string) => s
    const errorColor = this.useColor ? chalk.red : (s: string) => s
    const infoColor = this.useColor ? chalk.blue : (s: string) => s
    const mutedColor = this.useColor ? chalk.gray : (s: string) => s

    lines.push('')
    lines.push(headerColor('═══════════════════════════════════════════════════════════════'))
    lines.push(headerColor(`                     ${t('aiReport.title')}`))
    lines.push(headerColor('═══════════════════════════════════════════════════════════════'))
    lines.push('')

    // Provider and analysis info
    lines.push(`${infoColor(t('aiReport.provider'))}      ${providerColor(aiResult.provider)}`)
    lines.push(`${infoColor(t('aiReport.analysisType'))} ${aiResult.analysisType}`)
    lines.push(
      `${infoColor(t('aiReport.confidence'))}    ${this.formatConfidence(aiResult.confidence)}`
    )
    lines.push('')

    // Summary
    lines.push(headerColor(t('aiReport.summary')))
    lines.push(headerColor('───────────────────────────────────────────────────────────────'))
    lines.push(aiResult.summary)
    lines.push('')

    // Recommendations table
    if (aiResult.recommendations.length > 0) {
      lines.push(headerColor(t('aiReport.recommendations')))
      lines.push(headerColor('───────────────────────────────────────────────────────────────'))

      const table = new Table({
        head: [
          t('aiReport.tablePackage'),
          t('aiReport.tableVersionChange'),
          t('aiReport.tableAction'),
          t('aiReport.tableRisk'),
          t('aiReport.tableReason'),
        ],
        style: { head: this.useColor ? ['cyan'] : [] },
        colWidths: [20, 20, 10, 10, 35],
        wordWrap: true,
      })

      for (const rec of aiResult.recommendations) {
        const riskColor = this.getRiskColor(rec.riskLevel)
        const actionColor = this.getActionColor(rec.action)

        table.push([
          rec.package,
          `${rec.currentVersion} → ${rec.targetVersion}`,
          actionColor(rec.action),
          riskColor(rec.riskLevel),
          rec.reason,
        ])
      }

      lines.push(table.toString())
      lines.push('')
    }

    // Breaking changes
    const allBreakingChanges = aiResult.recommendations
      .filter((r) => r.breakingChanges && r.breakingChanges.length > 0)
      .flatMap((r) => r.breakingChanges || [])

    if (allBreakingChanges.length > 0) {
      lines.push(errorColor(t('aiReport.breakingChanges')))
      lines.push(headerColor('───────────────────────────────────────────────────────────────'))
      for (const change of allBreakingChanges) {
        lines.push(`  ${warningColor('•')} ${change}`)
      }
      lines.push('')
    }

    // Security fixes
    const allSecurityFixes = aiResult.recommendations
      .filter((r) => r.securityFixes && r.securityFixes.length > 0)
      .flatMap((r) => r.securityFixes || [])

    if (allSecurityFixes.length > 0) {
      lines.push(successColor(t('aiReport.securityFixes')))
      lines.push(headerColor('───────────────────────────────────────────────────────────────'))
      for (const fix of allSecurityFixes) {
        lines.push(`  ${successColor('•')} ${fix}`)
      }
      lines.push('')
    }

    // Warnings
    if (aiResult.warnings && aiResult.warnings.length > 0) {
      lines.push(warningColor(t('aiReport.warnings')))
      lines.push(headerColor('───────────────────────────────────────────────────────────────'))
      for (const warning of aiResult.warnings) {
        lines.push(`  ${warningColor('•')} ${warning}`)
      }
      lines.push('')
    }

    // Details
    if (aiResult.details) {
      lines.push(infoColor(t('aiReport.details')))
      lines.push(headerColor('───────────────────────────────────────────────────────────────'))
      lines.push(aiResult.details)
      lines.push('')
    }

    // Basic analysis info (if provided)
    if (basicAnalysis) {
      lines.push(mutedColor(t('aiReport.affectedPackages')))
      lines.push(headerColor('───────────────────────────────────────────────────────────────'))
      if (basicAnalysis.affectedPackages.length > 0) {
        for (const pkg of basicAnalysis.affectedPackages.slice(0, 10)) {
          // Handle both string and PackageImpact object types
          const pkgName = typeof pkg === 'string' ? pkg : pkg.packageName
          const pkgType =
            typeof pkg === 'object' && pkg.dependencyType ? ` (${pkg.dependencyType})` : ''
          lines.push(`  ${mutedColor('•')} ${pkgName}${mutedColor(pkgType)}`)
        }
        if (basicAnalysis.affectedPackages.length > 10) {
          lines.push(
            `  ${mutedColor(`  ${t('aiReport.andMore', { count: basicAnalysis.affectedPackages.length - 10 })}`)}`
          )
        }
      } else {
        lines.push(`  ${mutedColor(t('aiReport.noPackagesAffected'))}`)
      }
      lines.push('')
    }

    // Footer with metadata
    lines.push(mutedColor('───────────────────────────────────────────────────────────────'))
    const timestamp =
      aiResult.timestamp instanceof Date
        ? aiResult.timestamp.toISOString()
        : String(aiResult.timestamp)
    lines.push(mutedColor(t('aiReport.generatedAt', { timestamp })))
    if (aiResult.processingTimeMs) {
      lines.push(mutedColor(t('aiReport.processingTime', { time: aiResult.processingTimeMs })))
    }
    if (aiResult.tokensUsed) {
      lines.push(mutedColor(t('aiReport.tokensUsed', { tokens: aiResult.tokensUsed })))
    }
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Format AI analysis as minimal output
   */
  private formatAIAnalysisMinimal(aiResult: AnalysisResult): string {
    const lines: string[] = []

    lines.push(
      `[${aiResult.provider}] ${aiResult.analysisType} (${Math.round(aiResult.confidence * 100)}% confidence)`
    )
    lines.push(aiResult.summary)

    for (const rec of aiResult.recommendations) {
      lines.push(
        `${rec.action}: ${rec.package} ${rec.currentVersion} → ${rec.targetVersion} [${rec.riskLevel}]`
      )
    }

    return lines.join('\n')
  }

  /**
   * Format confidence score with color
   */
  private formatConfidence(confidence: number): string {
    const percentage = Math.round(confidence * 100)
    const bar =
      '█'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10))

    if (!this.useColor) {
      return `${bar} ${percentage}%`
    }

    if (confidence >= 0.8) {
      return chalk.green(`${bar} ${percentage}%`)
    } else if (confidence >= 0.5) {
      return chalk.yellow(`${bar} ${percentage}%`)
    } else {
      return chalk.red(`${bar} ${percentage}%`)
    }
  }

  /**
   * Get color for risk level
   */
  private getRiskColor(riskLevel: string): typeof chalk {
    if (!this.useColor) return chalk

    switch (riskLevel) {
      case 'critical':
        return chalk.red.bold
      case 'high':
        return chalk.red
      case 'medium':
        return chalk.yellow
      case 'low':
        return chalk.green
      default:
        return chalk.gray
    }
  }

  /**
   * Get color for action
   */
  private getActionColor(action: string): typeof chalk {
    if (!this.useColor) return chalk

    switch (action) {
      case 'update':
        return chalk.green
      case 'wait':
        return chalk.yellow
      case 'skip':
        return chalk.red
      case 'review':
        return chalk.cyan
      default:
        return chalk.white
    }
  }
}
