/**
 * Analyze Command
 *
 * CLI command to analyze the impact of updating a specific dependency.
 * Provides AI-powered and basic analysis options.
 *
 * QUAL-002/QUAL-003: Refactored to use unified output helpers and reduce coupling.
 */

import type { AnalysisType, CatalogUpdateService, WorkspaceService } from '@pcu/core'
import { AIAnalysisService, NpmRegistryService } from '@pcu/core'
import { logger, t } from '@pcu/utils'
import type { OutputFormat } from '../formatters/outputFormatter.js'
import { StyledText } from '../themes/colorTheme.js'
import { cliOutput } from '../utils/cliOutput.js'
import { handleCommandError, initializeCommand } from '../utils/commandHelpers.js'
import { errorsOnly, validateAnalyzeOptions } from '../validators/index.js'

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
  /**
   * QUAL-003: Optional services can be injected for testability.
   * If not provided, default instances are created when needed.
   */
  constructor(
    private readonly catalogUpdateService: CatalogUpdateService,
    private readonly workspaceService: WorkspaceService,
    private readonly registryService?: NpmRegistryService,
    private readonly aiService?: AIAnalysisService
  ) {}

  /**
   * Execute the analyze command
   * QUAL-002/QUAL-003: Uses unified output helpers and reduced coupling
   */
  async execute(
    packageName: string,
    version: string | undefined,
    options: AnalyzeCommandOptions = {}
  ): Promise<void> {
    // QUAL-005: Use shared command initialization
    const { formatter } = await initializeCommand(options)

    try {
      // Auto-detect catalog if not specified
      let catalog = options.catalog
      if (!catalog) {
        cliOutput.print(StyledText.muted(t('command.analyze.autoDetecting', { packageName })))
        catalog =
          (await this.catalogUpdateService.findCatalogForPackage(packageName, options.workspace)) ??
          undefined
        if (!catalog) {
          logger.error('Package not found in any catalog', undefined, {
            packageName,
            workspace: options.workspace,
          })
          cliOutput.error(
            StyledText.iconError(t('command.analyze.notFoundInCatalog', { packageName }))
          )
          cliOutput.print(StyledText.muted(t('command.analyze.specifyManually')))
          throw new Error(t('command.analyze.notFoundInCatalog', { packageName }))
        }
        cliOutput.print(StyledText.muted(`   ${t('command.analyze.foundInCatalog', { catalog })}`))
      }

      // Get latest version if not specified
      // QUAL-003: Use injected registry service or create default
      let targetVersion = version
      if (!targetVersion) {
        const registryService = this.registryService ?? new NpmRegistryService()
        targetVersion = (await registryService.getLatestVersion(packageName)).toString()
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
        cliOutput.print(StyledText.iconAnalysis(t('command.analyze.runningAI')))

        // QUAL-003: Use injected AI service or create default
        const aiService =
          this.aiService ??
          new AIAnalysisService({
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
          cliOutput.print(aiOutput)
          return
        } catch (aiError) {
          logger.warn('AI analysis failed', {
            error: aiError instanceof Error ? aiError.message : String(aiError),
            packageName,
            targetVersion,
            provider: options.provider,
          })
          cliOutput.warn(StyledText.iconWarning(t('command.analyze.aiFailed')))
          if (options.verbose) {
            cliOutput.warn(StyledText.muted(String(aiError)))
          }
          // Fall back to basic analysis
          const formattedOutput = formatter.formatImpactAnalysis(analysis)
          cliOutput.print(formattedOutput)
          return
        }
      } else {
        // Standard analysis without AI
        const formattedOutput = formatter.formatImpactAnalysis(analysis)
        cliOutput.print(formattedOutput)
      }
    } catch (error) {
      // QUAL-002: Use unified error handling
      handleCommandError(error, { verbose: options.verbose })
      throw error
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
   * Validate command options
   */
  static validateOptions(options: AnalyzeCommandOptions): string[] {
    return errorsOnly(validateAnalyzeOptions)(options)
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
