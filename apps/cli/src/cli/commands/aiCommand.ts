/**
 * AI Command
 *
 * CLI command to check AI provider status and availability.
 */

import { AIAnalysisService, AIDetector, analysisCache } from '@pcu/core'
import { t } from '@pcu/utils'
import chalk from 'chalk'
import { cliOutput } from '../utils/cliOutput.js'

export interface AiCommandOptions {
  status?: boolean
  test?: boolean
  cacheStats?: boolean
  clearCache?: boolean
}

export class AiCommand {
  /**
   * Execute the AI command
   */
  async execute(options: AiCommandOptions = {}): Promise<void> {
    if (options.clearCache) {
      analysisCache.clear()
      cliOutput.print(chalk.green(`✅ ${t('command.ai.cacheCleared')}`))
      return
    }

    if (options.cacheStats) {
      const stats = analysisCache.getStats()
      cliOutput.print(chalk.blue(`📊 ${t('command.ai.cacheStats')}`))
      cliOutput.print(chalk.gray('─────────────────────────────────'))
      cliOutput.print(`  ${t('command.ai.totalEntries')}: ${chalk.cyan(stats.totalEntries)}`)
      cliOutput.print(`  ${t('command.ai.cacheHits')}:    ${chalk.green(stats.hits)}`)
      cliOutput.print(`  ${t('command.ai.cacheMisses')}:  ${chalk.yellow(stats.misses)}`)
      cliOutput.print(
        `  ${t('command.ai.hitRate')}:      ${chalk.cyan(`${(stats.hitRate * 100).toFixed(1)}%`)}`
      )
      return
    }

    if (options.test) {
      await this.runTest()
      return
    }

    // Default: show status
    await this.showStatus()
  }

  /**
   * Run AI analysis test
   */
  private async runTest(): Promise<void> {
    cliOutput.print(chalk.blue(`🧪 ${t('command.ai.testingAnalysis')}`))

    const aiService = new AIAnalysisService({
      config: {
        fallback: { enabled: true, useRuleEngine: true },
      },
    })

    const testPackages = [
      {
        name: 'lodash',
        currentVersion: '4.17.20',
        targetVersion: '4.17.21',
        updateType: 'patch' as const,
      },
    ]

    const testWorkspaceInfo = {
      name: 'test-workspace',
      path: process.cwd(),
      packageCount: 1,
      catalogCount: 1,
    }

    try {
      const result = await aiService.analyzeUpdates(testPackages, testWorkspaceInfo, {
        analysisType: 'impact',
      })
      cliOutput.print(chalk.green(`✅ ${t('command.ai.testSuccess')}`))
      cliOutput.print(chalk.gray('─────────────────────────────────'))
      cliOutput.print(`  ${t('command.ai.providerLabel')} ${chalk.cyan(result.provider)}`)
      cliOutput.print(
        `  ${t('command.ai.confidenceLabel')} ${chalk.cyan(`${(result.confidence * 100).toFixed(0)}%`)}`
      )
      cliOutput.print(`  ${t('command.ai.summaryLabel')} ${result.summary}`)
    } catch (error) {
      cliOutput.print(chalk.yellow(`⚠️  ${t('command.ai.testFailed')}`))
      cliOutput.print(chalk.gray(String(error)))
    }
  }

  /**
   * Show AI provider status
   */
  private async showStatus(): Promise<void> {
    const aiDetector = new AIDetector()

    cliOutput.print(chalk.blue(`🤖 ${t('command.ai.providerStatus')}`))
    cliOutput.print(chalk.gray('─────────────────────────────────'))

    const summary = await aiDetector.getDetectionSummary()
    cliOutput.print(summary)

    const providers = await aiDetector.detectAvailableProviders()
    cliOutput.print('')
    cliOutput.print(chalk.blue(`📋 ${t('command.ai.providerDetails')}`))
    cliOutput.print(chalk.gray('─────────────────────────────────'))

    for (const provider of providers) {
      const statusIcon = provider.available ? chalk.green('✓') : chalk.red('✗')
      const statusText = provider.available
        ? chalk.green(t('command.ai.available'))
        : chalk.gray(t('command.ai.notFound'))
      const priorityText = chalk.gray(`(priority: ${provider.priority})`)

      cliOutput.print(
        `  ${statusIcon} ${chalk.cyan(provider.name)} - ${statusText} ${priorityText}`
      )

      if (provider.available && provider.path) {
        cliOutput.print(chalk.gray(`      ${t('command.ai.pathLabel')} ${provider.path}`))
      }
      if (provider.available && provider.version) {
        cliOutput.print(chalk.gray(`      ${t('command.ai.versionLabel')} ${provider.version}`))
      }
    }

    const best = await aiDetector.getBestProvider()
    if (best) {
      cliOutput.print('')
      cliOutput.print(chalk.green(`✨ ${t('command.ai.bestProvider', { provider: best.name })}`))
    }
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Check AI provider status and availability

Usage:
  pcu ai [options]

Options:
  --status             Show status of all AI providers (default)
  --test               Test AI analysis with a sample request
  --cache-stats        Show AI analysis cache statistics
  --clear-cache        Clear AI analysis cache

Examples:
  pcu ai                  # Show AI provider status
  pcu ai --test           # Test AI analysis
  pcu ai --cache-stats    # Show cache statistics
  pcu ai --clear-cache    # Clear the cache
    `
  }
}
