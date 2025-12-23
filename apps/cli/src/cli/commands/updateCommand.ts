/**
 * Update Command
 *
 * CLI command to update catalog dependencies.
 * Supports interactive mode, dry-run, and various update strategies.
 */

import {
  AIAnalysisService,
  type AnalysisType,
  type CatalogUpdateService,
  FileSystemService,
  FileWorkspaceRepository,
  type UpdateOptions,
  type UpdatePlan,
  type UpdateTarget,
  WorkspaceService,
} from '@pcu/core'
import { ConfigLoader, logger, t } from '@pcu/utils'
import chalk from 'chalk'
import { type OutputFormat, OutputFormatter } from '../formatters/outputFormatter.js'
import { ProgressBar } from '../formatters/progressBar.js'
import { InteractivePrompts } from '../interactive/interactivePrompts.js'
import { StyledText, ThemeManager } from '../themes/colorTheme.js'

export interface UpdateCommandOptions {
  workspace?: string
  catalog?: string
  format?: OutputFormat
  target?: UpdateTarget
  interactive?: boolean
  dryRun?: boolean
  force?: boolean
  prerelease?: boolean
  include?: string[]
  exclude?: string[]
  createBackup?: boolean
  verbose?: boolean
  color?: boolean
  // AI batch analysis options
  ai?: boolean
  provider?: string
  analysisType?: AnalysisType
  skipCache?: boolean
}

export class UpdateCommand {
  private readonly updateService: CatalogUpdateService

  constructor(updateService: CatalogUpdateService) {
    this.updateService = updateService
  }

  /**
   * Execute the update command
   */
  async execute(options: UpdateCommandOptions = {}): Promise<void> {
    let progressBar: ProgressBar | undefined

    try {
      // Initialize theme
      ThemeManager.setTheme('default')

      // Create progress bar for the update process
      progressBar = new ProgressBar({
        text: t('command.update.planningUpdates'),
        total: 4, // 4 main steps
      })
      progressBar.start(t('command.update.loadingConfig'))

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
      const updateOptions: UpdateOptions = {
        workspacePath: options.workspace,
        catalogName: options.catalog,
        target: options.target || config.defaults?.target,
        includePrerelease: options.prerelease ?? config.defaults?.includePrerelease ?? false,
        // CLI include/exclude options take priority over config file
        include: options.include?.length ? options.include : config.include,
        exclude: options.exclude?.length ? options.exclude : config.exclude,
        interactive: options.interactive ?? config.defaults?.interactive ?? false,
        dryRun: options.dryRun ?? config.defaults?.dryRun ?? false,
        force: options.force ?? false,
        createBackup: options.createBackup ?? config.defaults?.createBackup ?? false,
      }

      // Step 1: Planning updates
      progressBar.update(t('command.update.checkingVersions'), 1, 4)
      const plan = await this.updateService.planUpdates(updateOptions)

      // Step 2: Check if any updates found
      progressBar.update(t('command.update.analyzingUpdates'), 2, 4)

      if (!plan.updates.length) {
        progressBar.succeed(t('command.update.allUpToDate'))
        console.log(StyledText.iconSuccess(t('command.update.allUpToDate')))
        return
      }

      console.log(
        StyledText.iconPackage(t('command.update.foundUpdates', { count: plan.totalUpdates }))
      )

      // Interactive selection if enabled
      let finalPlan = plan
      if (options.interactive) {
        finalPlan = await this.interactiveSelection(plan)
        if (!finalPlan.updates.length) {
          progressBar.warn(t('command.update.noUpdatesSelected'))
          console.log(StyledText.iconWarning(t('command.update.noUpdatesSelected')))
          return
        }
      }

      // AI batch analysis if enabled - analyze ALL packages in one request
      if (options.ai) {
        progressBar.update(
          `🤖 ${t('command.update.runningBatchAI', { count: finalPlan.updates.length })}`,
          2.5,
          4
        )
        progressBar.stop()

        console.log(
          chalk.blue(
            `\n🤖 ${t('command.update.runningBatchAI', { count: finalPlan.updates.length })}`
          )
        )
        console.log(chalk.gray(`${t('command.update.batchAIHint')}\n`))

        try {
          const aiResult = await this.performBatchAIAnalysis(finalPlan, options)

          // Display AI analysis results
          console.log(chalk.blue(`\n📊 ${t('command.update.aiResults')}`))
          console.log(chalk.gray('─'.repeat(60)))
          console.log(chalk.cyan(t('command.update.provider', { provider: aiResult.provider })))
          console.log(
            chalk.cyan(
              t('command.update.confidence', { confidence: (aiResult.confidence * 100).toFixed(0) })
            )
          )
          console.log(
            chalk.cyan(t('command.update.processingTime', { time: aiResult.processingTimeMs }))
          )
          console.log(chalk.gray('─'.repeat(60)))
          console.log(chalk.yellow(`\n📝 ${t('command.update.summary')}`))
          console.log(aiResult.summary)

          // Display recommendations for each package
          if (aiResult.recommendations.length > 0) {
            console.log(chalk.yellow(`\n📦 ${t('command.update.packageRecommendations')}`))
            for (const rec of aiResult.recommendations) {
              const actionIcon = rec.action === 'update' ? '✅' : rec.action === 'skip' ? '❌' : '⚠️'
              const riskColor =
                rec.riskLevel === 'critical'
                  ? chalk.red
                  : rec.riskLevel === 'high'
                    ? chalk.yellow
                    : rec.riskLevel === 'medium'
                      ? chalk.cyan
                      : chalk.green

              console.log(
                `\n  ${actionIcon} ${chalk.bold(rec.package)}: ${rec.currentVersion} → ${rec.targetVersion}`
              )
              console.log(
                `     Action: ${chalk.bold(rec.action.toUpperCase())} | Risk: ${riskColor(rec.riskLevel)}`
              )
              console.log(`     ${rec.reason}`)

              if (rec.breakingChanges && rec.breakingChanges.length > 0) {
                console.log(
                  chalk.red(
                    `     ⚠️  ${t('command.update.breakingChanges', { changes: rec.breakingChanges.join(', ') })}`
                  )
                )
              }
              if (rec.securityFixes && rec.securityFixes.length > 0) {
                console.log(
                  chalk.green(
                    `     🔒 ${t('command.update.securityFixes', { fixes: rec.securityFixes.join(', ') })}`
                  )
                )
              }
            }
          }

          // Display warnings
          if (aiResult.warnings && aiResult.warnings.length > 0) {
            console.log(chalk.yellow(`\n⚠️  ${t('command.update.warnings')}`))
            for (const warning of aiResult.warnings) {
              console.log(chalk.yellow(`  - ${warning}`))
            }
          }

          console.log(chalk.gray(`\n${'─'.repeat(60)}`))

          // If there are critical/skip recommendations, warn the user
          const skipRecommendations = aiResult.recommendations.filter((r) => r.action === 'skip')
          if (skipRecommendations.length > 0 && !options.force) {
            console.log(
              chalk.red(
                `\n⛔ ${t('command.update.aiSkipRecommend', { count: skipRecommendations.length })}`
              )
            )
            console.log(chalk.yellow(t('command.update.useForce')))
          }
        } catch (aiError) {
          logger.warn('AI batch analysis failed', {
            error: aiError instanceof Error ? aiError.message : String(aiError),
            packageCount: finalPlan.updates.length,
            provider: options.provider,
          })
          console.warn(chalk.yellow(`\n⚠️  ${t('command.update.aiBatchFailed')}`))
          if (options.verbose) {
            console.warn(chalk.gray(String(aiError)))
          }
        }

        // Restart progress bar
        progressBar = new ProgressBar({
          text: t('command.update.preparingApply'),
          total: 4,
        })
        progressBar.start(t('command.update.preparingApply'))
      }

      // Step 3: Apply updates
      progressBar.update(t('command.update.preparingApply'), 3, 4)

      if (!options.dryRun) {
        // Replace the progress bar with one for applying updates
        progressBar.stop()
        progressBar = new ProgressBar({
          text: t('command.update.applyingUpdates'),
          total: finalPlan.updates.length,
        })
        progressBar.start(t('command.update.applyingUpdates'))

        const result = await this.updateService.executeUpdates(finalPlan, updateOptions)
        progressBar.succeed(t('command.update.appliedUpdates', { count: finalPlan.updates.length }))

        console.log(formatter.formatUpdateResult(result))
      } else {
        progressBar.update(t('command.update.generatingPreview'), 4, 4)
        progressBar.succeed(t('command.update.previewComplete'))
        console.log(StyledText.iconInfo(t('command.update.dryRunHint')))
        console.log(JSON.stringify(finalPlan, null, 2))
      }

      console.log(StyledText.iconComplete(t('command.update.processComplete')))
    } catch (error) {
      logger.error('Update command failed', error instanceof Error ? error : undefined, { options })
      if (progressBar) {
        progressBar.fail(t('progress.operationFailed'))
      }

      if (error instanceof Error) {
        console.error(StyledText.iconError(`${t('cli.error')} ${error.message}`))
      } else {
        console.error(StyledText.iconError(t('error.unknown')))
      }
      throw error
    }
  }

  /**
   * Interactive update selection
   */
  private async interactiveSelection(plan: UpdatePlan): Promise<UpdatePlan> {
    const interactivePrompts = new InteractivePrompts()

    // Transform PlannedUpdate to the format expected by InteractivePrompts
    const packages = plan.updates.map((update) => ({
      name: update.packageName,
      current: update.currentVersion,
      latest: update.newVersion,
      type: update.updateType,
    }))

    const selectedPackageNames = await interactivePrompts.selectPackages(packages)

    // Filter the plan to only include selected packages
    const selectedUpdates = plan.updates.filter((update) =>
      selectedPackageNames.includes(update.packageName)
    )

    return {
      ...plan,
      updates: selectedUpdates,
      totalUpdates: selectedUpdates.length,
    }
  }

  /**
   * Perform batch AI analysis for all packages in the update plan
   * This analyzes ALL packages in a single AI request for efficiency
   */
  private async performBatchAIAnalysis(plan: UpdatePlan, options: UpdateCommandOptions) {
    const workspacePath = options.workspace || process.cwd()

    // Create workspace service to get workspace info
    const fileSystemService = new FileSystemService()
    const workspaceRepository = new FileWorkspaceRepository(fileSystemService)
    const workspaceService = new WorkspaceService(workspaceRepository)
    const workspaceInfo = await workspaceService.getWorkspaceInfo(workspacePath)

    // Create AI service
    const aiService = new AIAnalysisService({
      config: {
        preferredProvider: options.provider === 'auto' ? 'auto' : options.provider,
        cache: { enabled: !options.skipCache, ttl: 3600 },
        fallback: { enabled: true, useRuleEngine: true },
      },
    })

    // Convert all planned updates to PackageUpdateInfo format for batch analysis
    const packages = plan.updates.map((update) => ({
      name: update.packageName,
      currentVersion: update.currentVersion,
      targetVersion: update.newVersion,
      updateType: update.updateType,
      catalogName: update.catalogName,
    }))

    // Build workspace info for AI
    const wsInfo = {
      name: workspaceInfo.name,
      path: workspaceInfo.path,
      packageCount: workspaceInfo.packageCount,
      catalogCount: workspaceInfo.catalogCount,
    }

    // Perform single batch analysis for ALL packages
    const result = await aiService.analyzeUpdates(packages, wsInfo, {
      analysisType: options.analysisType || 'impact',
      skipCache: options.skipCache,
    })

    return result
  }

  /**
   * Validate command options
   */
  static validateOptions(options: UpdateCommandOptions): string[] {
    const errors: string[] = []

    // Validate format
    if (options.format && !['table', 'json', 'yaml', 'minimal'].includes(options.format)) {
      errors.push(t('validation.invalidFormat'))
    }

    // Validate target
    if (
      options.target &&
      !['latest', 'greatest', 'minor', 'patch', 'newest'].includes(options.target)
    ) {
      errors.push(t('validation.invalidTarget'))
    }

    // Interactive and dry-run conflict
    if (options.interactive && options.dryRun) {
      errors.push(t('validation.interactiveWithDryRun'))
    }

    return errors
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Update catalog dependencies

Usage:
  pcu update [options]

Options:
  --workspace <path>     Workspace directory (default: current directory)
  --catalog <name>       Update specific catalog only
  --format <type>        Output format: table, json, yaml, minimal (default: table)
  --target <type>        Update target: latest, greatest, minor, patch, newest (default: latest)
  -i, --interactive      Interactive mode to choose updates
  -d, --dry-run          Preview changes without writing files
  --force                Force updates even if conflicts exist
  --prerelease           Include prerelease versions
  --include <pattern>    Include packages matching pattern (can be used multiple times)
  --exclude <pattern>    Exclude packages matching pattern (can be used multiple times)
  --create-backup        Create backup files before updating
  --verbose              Show detailed information
  --no-color             Disable colored output

Examples:
  pcu update                          # Update all catalogs
  pcu update --interactive            # Interactive update selection
  pcu update --dry-run               # Preview updates without applying
  pcu update --catalog react17       # Update specific catalog
  pcu update --target minor          # Update to latest minor versions only
  pcu update --force                 # Force updates despite conflicts
  pcu update --include "react*"      # Update only React packages

Exit Codes:
  0  Updates completed successfully
  1  Updates failed or were cancelled
  2  Error occurred
    `
  }
}
