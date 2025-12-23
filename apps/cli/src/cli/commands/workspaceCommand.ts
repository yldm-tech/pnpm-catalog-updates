/**
 * Workspace Command
 *
 * CLI command to display workspace information and validation.
 */

import type { WorkspaceService } from '@pcu/core'
import { CommandExitError, t } from '@pcu/utils'
import { type OutputFormat, OutputFormatter } from '../formatters/outputFormatter.js'

export interface WorkspaceCommandOptions {
  workspace?: string
  validate?: boolean
  stats?: boolean
  format?: OutputFormat
  verbose?: boolean
  color?: boolean
}

export class WorkspaceCommand {
  constructor(private readonly workspaceService: WorkspaceService) {}

  /**
   * Execute the workspace command
   */
  async execute(options: WorkspaceCommandOptions = {}): Promise<void> {
    const formatter = new OutputFormatter(options.format || 'table', options.color !== false)

    if (options.validate) {
      const report = await this.workspaceService.validateWorkspace(options.workspace)
      const formattedOutput = formatter.formatValidationReport(report)
      console.log(formattedOutput)
      throw report.isValid
        ? CommandExitError.success()
        : CommandExitError.failure('Validation failed')
    } else if (options.stats) {
      const stats = await this.workspaceService.getWorkspaceStats(options.workspace)
      const formattedOutput = formatter.formatWorkspaceStats(stats)
      console.log(formattedOutput)
      throw CommandExitError.success()
    } else {
      const info = await this.workspaceService.getWorkspaceInfo(options.workspace)
      console.log(formatter.formatMessage(`${t('command.workspace.title')}: ${info.name}`, 'info'))
      console.log(formatter.formatMessage(`${t('command.workspace.path')}: ${info.path}`, 'info'))
      console.log(
        formatter.formatMessage(`${t('command.workspace.packages')}: ${info.packageCount}`, 'info')
      )
      console.log(
        formatter.formatMessage(`${t('command.workspace.catalogs')}: ${info.catalogCount}`, 'info')
      )

      if (info.catalogNames.length > 0) {
        console.log(
          formatter.formatMessage(
            `${t('command.workspace.catalogNames')}: ${info.catalogNames.join(', ')}`,
            'info'
          )
        )
      }
      throw CommandExitError.success()
    }
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Workspace information and validation

Usage:
  pcu workspace [options]

Options:
  --validate           Validate workspace configuration
  -s, --stats          Show workspace statistics
  -f, --format <type>  Output format: table, json, yaml, minimal (default: table)
  --verbose            Show detailed information

Examples:
  pcu workspace                  # Show basic workspace info
  pcu workspace --validate       # Validate workspace configuration
  pcu workspace --stats          # Show workspace statistics
  pcu workspace --format json    # Output as JSON
    `
  }
}
