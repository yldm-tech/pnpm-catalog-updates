/**
 * AI Command
 *
 * CLI command to check AI provider status and availability.
 */

import { AIAnalysisService, AIDetector, analysisCache } from '@pcu/core'
import chalk from 'chalk'

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
      console.log(chalk.green('✅ AI analysis cache cleared'))
      return
    }

    if (options.cacheStats) {
      const stats = analysisCache.getStats()
      console.log(chalk.blue('📊 AI Analysis Cache Statistics'))
      console.log(chalk.gray('─────────────────────────────────'))
      console.log(`  Total entries: ${chalk.cyan(stats.totalEntries)}`)
      console.log(`  Cache hits:    ${chalk.green(stats.hits)}`)
      console.log(`  Cache misses:  ${chalk.yellow(stats.misses)}`)
      console.log(`  Hit rate:      ${chalk.cyan(`${(stats.hitRate * 100).toFixed(1)}%`)}`)
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
    console.log(chalk.blue('🧪 Testing AI analysis...'))

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
      console.log(chalk.green('✅ AI analysis test successful!'))
      console.log(chalk.gray('─────────────────────────────────'))
      console.log(`  Provider: ${chalk.cyan(result.provider)}`)
      console.log(`  Confidence: ${chalk.cyan(`${(result.confidence * 100).toFixed(0)}%`)}`)
      console.log(`  Summary: ${result.summary}`)
    } catch (error) {
      console.log(chalk.yellow('⚠️  AI analysis test failed:'))
      console.log(chalk.gray(String(error)))
    }
  }

  /**
   * Show AI provider status
   */
  private async showStatus(): Promise<void> {
    const aiDetector = new AIDetector()

    console.log(chalk.blue('🤖 AI Provider Status'))
    console.log(chalk.gray('─────────────────────────────────'))

    const summary = await aiDetector.getDetectionSummary()
    console.log(summary)

    const providers = await aiDetector.detectAvailableProviders()
    console.log('')
    console.log(chalk.blue('📋 Provider Details'))
    console.log(chalk.gray('─────────────────────────────────'))

    for (const provider of providers) {
      const statusIcon = provider.available ? chalk.green('✓') : chalk.red('✗')
      const statusText = provider.available ? chalk.green('Available') : chalk.gray('Not found')
      const priorityText = chalk.gray(`(priority: ${provider.priority})`)

      console.log(`  ${statusIcon} ${chalk.cyan(provider.name)} - ${statusText} ${priorityText}`)

      if (provider.available && provider.path) {
        console.log(chalk.gray(`      Path: ${provider.path}`))
      }
      if (provider.available && provider.version) {
        console.log(chalk.gray(`      Version: ${provider.version}`))
      }
    }

    const best = await aiDetector.getBestProvider()
    if (best) {
      console.log('')
      console.log(chalk.green(`✨ Best available provider: ${best.name}`))
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
