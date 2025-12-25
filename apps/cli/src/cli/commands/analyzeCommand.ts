/**
 * Analyze Command
 *
 * CLI command to analyze the impact of updating a specific dependency.
 * Provides AI-powered and basic analysis options.
 */

import type { AnalysisType, CatalogUpdateService, WorkspaceService } from '@pcu/core'
import { AIAnalysisService, NpmRegistryService } from '@pcu/core'
import { logger, t } from '@pcu/utils'
import chalk from 'chalk'
import { type OutputFormat, OutputFormatter } from '../formatters/outputFormatter.js'

export interface AnalyzeCommandOptions {
  workspace?: string
  catalog?: string
  format?: OutputFormat
  ai?: boolean
  provider?: string
  analysisType?: AnalysisType
  skipCache?: boolean
  verbose?: boolean
  color?: boolean
}

export class AnalyzeCommand {
  constructor(
    private readonly catalogUpdateService: CatalogUpdateService,
    private readonly workspaceService: WorkspaceService
  ) {}

  /**
   * Execute the analyze command
   */
  async execute(
    packageName: string,
    version: string | undefined,
    options: AnalyzeCommandOptions = {}
  ): Promise<void> {
    const formatter = new OutputFormatter(options.format || 'table', options.color !== false)

    // Auto-detect catalog if not specified
    let catalog = options.catalog
    if (!catalog) {
      console.log(chalk.gray(`${t('command.analyze.autoDetecting', { packageName })}`))
      catalog =
        (await this.catalogUpdateService.findCatalogForPackage(packageName, options.workspace)) ??
        undefined
      if (!catalog) {
        logger.error('Package not found in any catalog', undefined, {
          packageName,
          workspace: options.workspace,
        })
        console.error(chalk.red(`❌ ${t('command.analyze.notFoundInCatalog', { packageName })}`))
        console.log(chalk.gray(t('command.analyze.specifyManually')))
        throw new Error(t('command.analyze.notFoundInCatalog', { packageName }))
      }
      console.log(chalk.gray(`   ${t('command.analyze.foundInCatalog', { catalog })}`))
    }

    // Get latest version if not specified
    let targetVersion = version
    if (!targetVersion) {
      const tempRegistryService = new NpmRegistryService()
      targetVersion = (await tempRegistryService.getLatestVersion(packageName)).toString()
    }

    // Get basic impact analysis first
    const analysis = await this.catalogUpdateService.analyzeImpact(
      catalog,
      packageName,
      targetVersion,
      options.workspace
    )

    // AI analysis is enabled by default (use --no-ai to disable)
    const aiEnabled = options.ai !== false

    if (aiEnabled) {
      console.log(chalk.blue(`${t('command.analyze.runningAI')}`))

      const aiService = new AIAnalysisService({
        config: {
          preferredProvider: options.provider === 'auto' ? 'auto' : options.provider,
          cache: { enabled: !options.skipCache, ttl: 3600 },
          fallback: { enabled: true, useRuleEngine: true },
        },
      })

      // Get workspace info
      const workspaceInfo = await this.workspaceService.getWorkspaceInfo(options.workspace)

      // Build packages info for AI analysis
      const packages = [
        {
          name: packageName,
          currentVersion: analysis.currentVersion,
          targetVersion: analysis.proposedVersion,
          updateType: analysis.updateType,
        },
      ]

      // Build workspace info for AI
      const wsInfo = {
        name: workspaceInfo.name,
        path: workspaceInfo.path,
        packageCount: workspaceInfo.packageCount,
        catalogCount: workspaceInfo.catalogCount,
      }

      try {
        const aiResult = await aiService.analyzeUpdates(packages, wsInfo, {
          analysisType: options.analysisType || 'impact',
          skipCache: options.skipCache,
        })

        // Format and display AI analysis result
        const aiOutput = formatter.formatAIAnalysis(aiResult, analysis)
        console.log(aiOutput)
        return
      } catch (aiError) {
        logger.warn('AI analysis failed', {
          error: aiError instanceof Error ? aiError.message : String(aiError),
          packageName,
          targetVersion,
          provider: options.provider,
        })
        console.warn(chalk.yellow(`⚠️ ${t('command.analyze.aiFailed')}`))
        if (options.verbose) {
          console.warn(chalk.gray(String(aiError)))
        }
        // Fall back to basic analysis
        const formattedOutput = formatter.formatImpactAnalysis(analysis)
        console.log(formattedOutput)
        return
      }
    } else {
      // Standard analysis without AI
      const formattedOutput = formatter.formatImpactAnalysis(analysis)
      console.log(formattedOutput)
    }
  }

  /**
   * Validate command arguments
   */
  static validateArgs(packageName: string): string[] {
    const errors: string[] = []

    if (!packageName || packageName.trim() === '') {
      errors.push(t('validation.packageNameRequired'))
    }

    return errors
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Analyze the impact of updating a specific dependency

Usage:
  pcu analyze <package> [version] [options]

Arguments:
  package              Package name to analyze
  version              New version (default: latest)

Options:
  --catalog <name>     Catalog name (auto-detected if not specified)
  -f, --format <type>  Output format: table, json, yaml, minimal (default: table)
  --no-ai              Disable AI-powered analysis
  --provider <name>    AI provider: auto, claude, gemini, codex (default: auto)
  --analysis-type <t>  AI analysis type: impact, security, compatibility, recommend
  --skip-cache         Skip AI analysis cache
  --verbose            Show detailed information

Examples:
  pcu analyze lodash                    # Analyze update to latest version
  pcu analyze lodash 4.18.0            # Analyze update to specific version
  pcu analyze @types/node --no-ai      # Disable AI analysis
  pcu analyze react --format json      # Output as JSON
    `
  }
}
