/**
 * AI Analysis Handler
 *
 * Handles AI analysis display and formatting for the update command.
 */

import {
  AIAnalysisService,
  type AnalysisResult,
  type AnalysisType,
  type UpdatePlan,
  type WorkspaceService,
} from '@pcu/core'
import { logger, t } from '@pcu/utils'
import chalk from 'chalk'
import { cliOutput } from '../utils/cliOutput.js'

/**
 * Options for AI analysis
 */
export interface AIAnalysisOptions {
  workspace?: string
  provider?: string
  analysisType?: AnalysisType
  skipCache?: boolean
  verbose?: boolean
  force?: boolean
}

/**
 * Handles AI analysis for package updates
 */
export class AIAnalysisHandler {
  private readonly workspaceService: WorkspaceService

  constructor(workspaceService: WorkspaceService) {
    this.workspaceService = workspaceService
  }

  /**
   * Perform AI analysis and display results
   */
  async analyzeAndDisplay(plan: UpdatePlan, options: AIAnalysisOptions): Promise<void> {
    cliOutput.print(
      chalk.blue(`\n🤖 ${t('command.update.runningBatchAI', { count: plan.updates.length })}`)
    )
    cliOutput.print(chalk.gray(`${t('command.update.batchAIHint')}\n`))

    try {
      const aiResult = await this.performBatchAnalysis(plan, options)
      this.displayResults(aiResult, options.force)
    } catch (aiError) {
      logger.warn('AI batch analysis failed', {
        error: aiError instanceof Error ? aiError.message : String(aiError),
        packageCount: plan.updates.length,
        provider: options.provider,
      })
      cliOutput.warn(chalk.yellow(`\n⚠️  ${t('command.update.aiBatchFailed')}`))
      if (options.verbose) {
        cliOutput.warn(chalk.gray(String(aiError)))
      }
    }
  }

  /**
   * Perform batch AI analysis for all packages in the update plan
   */
  private async performBatchAnalysis(
    plan: UpdatePlan,
    options: AIAnalysisOptions
  ): Promise<AnalysisResult> {
    const workspacePath = options.workspace || process.cwd()
    const workspaceInfo = await this.workspaceService.getWorkspaceInfo(workspacePath)

    const aiService = new AIAnalysisService({
      config: {
        preferredProvider: options.provider === 'auto' ? 'auto' : options.provider,
        cache: { enabled: !options.skipCache, ttl: 3600 },
        fallback: { enabled: true, useRuleEngine: true },
      },
    })

    // Convert planned updates to PackageUpdateInfo format
    const packages = plan.updates.map((update) => ({
      name: update.packageName,
      currentVersion: update.currentVersion,
      targetVersion: update.newVersion,
      updateType: update.updateType,
      catalogName: update.catalogName,
    }))

    const wsInfo = {
      name: workspaceInfo.name,
      path: workspaceInfo.path,
      packageCount: workspaceInfo.packageCount,
      catalogCount: workspaceInfo.catalogCount,
    }

    return aiService.analyzeWithChunking(packages, wsInfo, {
      analysisType: options.analysisType || 'impact',
      skipCache: options.skipCache,
      chunking: {
        enabled: true,
        threshold: 15,
        chunkSize: 10,
        onProgress: options.verbose
          ? (progress) => {
              cliOutput.print(
                chalk.gray(
                  `  ${t('command.update.processingChunks', {
                    current: progress.currentChunk,
                    total: progress.totalChunks,
                  })} (${progress.percentComplete}%)`
                )
              )
            }
          : undefined,
      },
    })
  }

  /**
   * Display AI analysis results
   */
  private displayResults(aiResult: AnalysisResult, force?: boolean): void {
    cliOutput.print(chalk.blue(`\n📊 ${t('command.update.aiResults')}`))
    cliOutput.print(chalk.gray('─'.repeat(60)))
    cliOutput.print(chalk.cyan(t('command.update.provider', { provider: aiResult.provider })))
    cliOutput.print(
      chalk.cyan(
        t('command.update.confidence', { confidence: (aiResult.confidence * 100).toFixed(0) })
      )
    )
    cliOutput.print(
      chalk.cyan(t('command.update.processingTime', { time: aiResult.processingTimeMs }))
    )
    cliOutput.print(chalk.gray('─'.repeat(60)))
    cliOutput.print(chalk.yellow(`\n📝 ${t('command.update.summary')}`))
    cliOutput.print(aiResult.summary)

    if (aiResult.recommendations.length > 0) {
      cliOutput.print(chalk.yellow(`\n📦 ${t('command.update.packageRecommendations')}`))
      for (const rec of aiResult.recommendations) {
        this.displayRecommendation(rec)
      }
    }

    if (aiResult.warnings && aiResult.warnings.length > 0) {
      cliOutput.print(chalk.yellow(`\n⚠️  ${t('command.update.warnings')}`))
      for (const warning of aiResult.warnings) {
        cliOutput.print(chalk.yellow(`  - ${warning}`))
      }
    }

    cliOutput.print(chalk.gray(`\n${'─'.repeat(60)}`))

    const skipRecommendations = aiResult.recommendations.filter((r) => r.action === 'skip')
    if (skipRecommendations.length > 0 && !force) {
      cliOutput.print(
        chalk.red(
          `\n⛔ ${t('command.update.aiSkipRecommend', { count: skipRecommendations.length })}`
        )
      )
      cliOutput.print(chalk.yellow(t('command.update.useForce')))
    }
  }

  /**
   * Display a single package recommendation
   */
  private displayRecommendation(rec: AnalysisResult['recommendations'][0]): void {
    const actionIcon = rec.action === 'update' ? '✅' : rec.action === 'skip' ? '❌' : '⚠️'
    const riskColor =
      rec.riskLevel === 'critical'
        ? chalk.red
        : rec.riskLevel === 'high'
          ? chalk.yellow
          : rec.riskLevel === 'medium'
            ? chalk.cyan
            : chalk.green

    cliOutput.print(
      `\n  ${actionIcon} ${chalk.bold(rec.package)}: ${rec.currentVersion} → ${rec.targetVersion}`
    )
    cliOutput.print(
      `     Action: ${chalk.bold(rec.action.toUpperCase())} | Risk: ${riskColor(rec.riskLevel)}`
    )
    cliOutput.print(`     ${rec.reason}`)

    if (rec.breakingChanges && rec.breakingChanges.length > 0) {
      cliOutput.print(
        chalk.red(
          `     ⚠️  ${t('command.update.breakingChanges', { changes: rec.breakingChanges.join(', ') })}`
        )
      )
    }
    if (rec.securityFixes && rec.securityFixes.length > 0) {
      cliOutput.print(
        chalk.green(
          `     🔒 ${t('command.update.securityFixes', { fixes: rec.securityFixes.join(', ') })}`
        )
      )
    }
  }
}
