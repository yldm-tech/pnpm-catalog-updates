/**
 * Workspace Command
 *
 * CLI command to display workspace information and validation.
 */

import type { WorkspaceService } from '@pcu/core'
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
  async execute(options: WorkspaceCommandOptions = {}): Promise<number> {
    const formatter = new OutputFormatter(options.format || 'table', options.color !== false)

    if (options.validate) {
      const report = await this.workspaceService.validateWorkspace(options.workspace)
      const formattedOutput = formatter.formatValidationReport(report)
      console.log(formattedOutput)
      return report.isValid ? 0 : 1
    } else if (options.stats) {
      const stats = await this.workspaceService.getWorkspaceStats(options.workspace)
      const formattedOutput = formatter.formatWorkspaceStats(stats)
      console.log(formattedOutput)
      return 0
    } else {
      const info = await this.workspaceService.getWorkspaceInfo(options.workspace)
      console.log(formatter.formatMessage(`Workspace: ${info.name}`, 'info'))
      console.log(formatter.formatMessage(`Path: ${info.path}`, 'info'))
      console.log(formatter.formatMessage(`Packages: ${info.packageCount}`, 'info'))
      console.log(formatter.formatMessage(`Catalogs: ${info.catalogCount}`, 'info'))

      if (info.catalogNames.length > 0) {
        console.log(
          formatter.formatMessage(`Catalog names: ${info.catalogNames.join(', ')}`, 'info')
        )
      }
      return 0
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
