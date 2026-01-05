/**
 * Color Utilities for CLI Formatters
 *
 * Provides color-related utilities for terminal output formatting.
 * Extracted from OutputFormatter for better maintainability.
 */

import chalk from 'chalk'

// Build ANSI escape regex without literal control characters
const ANSI_ESCAPE = String.fromCharCode(27)
export const ansiRegex: RegExp = new RegExp(`${ANSI_ESCAPE}\\[[0-9;]*m`, 'g')

/**
 * Color utility functions for CLI output formatting
 */
export class ColorUtils {
  constructor(private readonly useColor: boolean = true) {}

  /**
   * Apply color if color is enabled
   */
  colorize(colorFn: typeof chalk, text: string): string {
    return this.useColor ? colorFn(text) : text
  }

  /**
   * Strip ANSI escape codes from a string (for accurate width calculation)
   */
  stripAnsi(str: string): string {
    return str.replace(ansiRegex, '')
  }

  /**
   * Pad a string containing ANSI codes to a target visible width
   * Returns the original string with trailing spaces to match target width
   */
  padAnsi(str: string, targetWidth: number): string {
    const visibleWidth = this.stripAnsi(str).length
    const padding = Math.max(0, targetWidth - visibleWidth)
    return str + ' '.repeat(padding)
  }

  /**
   * Colorize table headers
   */
  colorizeHeaders(headers: string[]): string[] {
    return this.useColor ? headers.map((h) => chalk.bold.cyan(h)) : headers
  }

  /**
   * Get color for update type
   */
  getUpdateTypeColor(updateType: string): typeof chalk {
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
   * Get color for severity level
   */
  getSeverityColor(severity: string): typeof chalk {
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
   * Get color for risk level
   */
  getRiskColor(riskLevel: string): typeof chalk {
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
  getActionColor(action: string): typeof chalk {
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

  /**
   * Format confidence score with color and visual bar
   */
  formatConfidence(confidence: number): string {
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
}
