/**
 * Error Renderer
 *
 * Responsible for rendering error messages to the console.
 * Separates UI presentation from error classification logic.
 */

import chalk from 'chalk'
import { t } from '../i18n/i18n.js'

export interface ErrorInfo {
  type: 'packageNotFound' | 'emptyVersion' | 'network' | 'security' | 'generic'
  packageName: string
  suggestions?: string[]
  message?: string
}

export interface SkippedPackagesSummary {
  total: number
  notFound: string[]
  emptyVersion: string[]
  network: string[]
  other: string[]
  securityFailures: number
}

/**
 * Renders error messages to the console.
 * This class handles all UI/console output for errors.
 */
export class ErrorRenderer {
  /**
   * Render package not found error with optional suggestions
   */
  static renderPackageNotFound(packageName: string, suggestions?: string[]): void {
    if (suggestions && suggestions.length > 0) {
      console.log(chalk.yellow(`⚠️  ${t('error.packageNotFoundWithSuggestion', { packageName })}`))
      console.log(chalk.cyan(`💡 ${t('error.possiblePackageNames')}`))
      suggestions.forEach((suggestion) => {
        console.log(chalk.cyan(`   • ${suggestion}`))
      })
    } else {
      console.log(chalk.yellow(`⚠️  ${t('error.packageNotFound', { packageName })}`))
      console.log(chalk.cyan(`💡 ${t('error.checkPackageName')}`))
    }
  }

  /**
   * Render empty version error
   */
  static renderEmptyVersion(packageName: string): void {
    console.log(chalk.yellow(`⚠️  ${t('error.emptyVersion', { packageName })}`))
    console.log(chalk.cyan(`💡 ${t('error.emptyVersionReasons')}`))
  }

  /**
   * Render network error
   */
  static renderNetworkError(packageName: string): void {
    console.log(chalk.yellow(`⚠️  ${t('error.networkError', { packageName })}`))
    console.log(chalk.cyan(`💡 ${t('error.networkRetry')}`))
  }

  /**
   * Render security check unavailable message
   */
  static renderSecurityCheckUnavailable(packageName: string): void {
    console.log(chalk.yellow(`⚠️  ${t('error.securityCheckUnavailable', { packageName })}`))
  }

  /**
   * Render generic package skipped message
   */
  static renderPackageSkipped(packageName: string): void {
    console.log(chalk.yellow(`⚠️  ${t('error.packageSkipped', { packageName })}`))
  }

  /**
   * Render skipped packages summary
   */
  static renderSkippedPackagesSummary(summary: SkippedPackagesSummary): void {
    if (summary.total === 0) return

    console.log()
    console.log(chalk.cyan(`📋 ${t('summary.skippedPackages', { count: summary.total })}`))

    if (summary.notFound.length > 0) {
      console.log(
        chalk.yellow(
          `   ${t('summary.notFoundPackages', { count: summary.notFound.length, packages: summary.notFound.join(', ') })}`
        )
      )
    }

    if (summary.emptyVersion.length > 0) {
      console.log(
        chalk.yellow(
          `   ${t('summary.emptyVersionPackages', { count: summary.emptyVersion.length, packages: summary.emptyVersion.join(', ') })}`
        )
      )
    }

    if (summary.network.length > 0) {
      console.log(
        chalk.yellow(
          `   ${t('summary.networkIssuePackages', { count: summary.network.length, packages: summary.network.join(', ') })}`
        )
      )
    }

    if (summary.other.length > 0) {
      console.log(
        chalk.yellow(
          `   ${t('summary.otherIssuePackages', { count: summary.other.length, packages: summary.other.join(', ') })}`
        )
      )
    }

    if (summary.securityFailures > 0) {
      console.log(
        chalk.gray(`   ${t('summary.securityCheckFailures', { count: summary.securityFailures })}`)
      )
    }
  }

  /**
   * Render error based on ErrorInfo structure
   */
  static render(info: ErrorInfo): void {
    switch (info.type) {
      case 'packageNotFound':
        ErrorRenderer.renderPackageNotFound(info.packageName, info.suggestions)
        break
      case 'emptyVersion':
        ErrorRenderer.renderEmptyVersion(info.packageName)
        break
      case 'network':
        ErrorRenderer.renderNetworkError(info.packageName)
        break
      case 'security':
        ErrorRenderer.renderSecurityCheckUnavailable(info.packageName)
        break
      case 'generic':
        ErrorRenderer.renderPackageSkipped(info.packageName)
        break
    }
  }
}
