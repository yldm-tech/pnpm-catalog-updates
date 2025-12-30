/**
 * Update Command
 *
 * CLI command to update catalog dependencies.
 * Supports interactive mode, dry-run, and various update strategies.
 */

import type {
  AnalysisType,
  CatalogUpdateService,
  IPackageManagerService,
  UpdateOptions,
  UpdatePlan,
  UpdateTarget,
  WorkspaceService,
} from '@pcu/core'
import { type PackageFilterConfig, t } from '@pcu/utils'
import type { OutputFormat, OutputFormatter } from '../formatters/outputFormatter.js'
import { ProgressBar } from '../formatters/progressBar.js'
import { AIAnalysisHandler, ChangelogHandler, InstallHandler } from '../handlers/index.js'
import { InteractivePrompts } from '../interactive/interactivePrompts.js'
import { StyledText } from '../themes/colorTheme.js'
import { cliOutput } from '../utils/cliOutput.js'
import {
  createFormatter,
  getEffectivePatterns,
  getEffectiveTarget,
  handleCommandError,
  initializeTheme,
  loadConfiguration,
  mergeWithConfig,
} from '../utils/commandHelpers.js'
import { errorsOnly, validateUpdateOptions } from '../validators/index.js'

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
  // Auto install after update
  install?: boolean
  // Show changelog for updates
  changelog?: boolean
  // Skip security vulnerability checks
  noSecurity?: boolean
}

export class UpdateCommand {
  private readonly updateService: CatalogUpdateService
  private readonly aiAnalysisHandler: AIAnalysisHandler
  private readonly changelogHandler: ChangelogHandler
  private readonly installHandler: InstallHandler

  constructor(
    updateService: CatalogUpdateService,
    workspaceService: WorkspaceService,
    packageManagerService: IPackageManagerService
  ) {
    this.updateService = updateService
    this.aiAnalysisHandler = new AIAnalysisHandler(workspaceService)
    this.changelogHandler = new ChangelogHandler()
    // ARCH-002: Extracted install logic to dedicated handler
    this.installHandler = new InstallHandler(packageManagerService)
  }

  /**
   * Execute the update command
   */
  async execute(options: UpdateCommandOptions = {}): Promise<void> {
    const progressBar = this.createProgressBar()

    try {
      // Load configuration and merge with CLI options
      const { updateOptions, formatter } = await this.prepareUpdateContext(options)

      // Plan updates
      const plan = await this.planUpdates(progressBar, updateOptions)

      // Handle empty plan
      if (!plan.updates.length) {
        progressBar.succeed(t('command.update.allUpToDate'))
        cliOutput.print(StyledText.iconSuccess(t('command.update.allUpToDate')))
        return
      }

      progressBar.succeed(t('command.update.foundUpdates', { count: plan.totalUpdates }))

      // Process optional features and get final plan
      const finalPlan = await this.processOptionalFeatures(plan, options)
      if (!finalPlan) return

      // Execute updates or show dry-run preview
      await this.executeUpdatesOrDryRun(finalPlan, updateOptions, options, formatter)

      cliOutput.print(StyledText.iconComplete(t('command.update.processComplete')))
    } catch (error) {
      this.handleExecuteError(error, progressBar, options)
    }
  }

  /**
   * Create and initialize progress bar
   */
  private createProgressBar(): ProgressBar {
    initializeTheme('default')
    const progressBar = new ProgressBar({
      text: t('command.update.planningUpdates'),
      total: 4,
    })
    progressBar.start(t('command.update.loadingConfig'))
    return progressBar
  }

  /**
   * Plan updates with progress tracking
   */
  private async planUpdates(
    progressBar: ProgressBar,
    updateOptions: UpdateOptions
  ): Promise<UpdatePlan> {
    progressBar.update(t('command.update.checkingVersions'), 1, 4)
    const plan = await this.updateService.planUpdates(updateOptions)
    progressBar.update(t('command.update.analyzingUpdates'), 2, 4)
    return plan
  }

  /**
   * Process optional features (changelog, interactive selection, AI analysis)
   * @returns Final plan or null if user cancelled
   */
  private async processOptionalFeatures(
    plan: UpdatePlan,
    options: UpdateCommandOptions
  ): Promise<UpdatePlan | null> {
    // Display changelog if enabled (uses ChangelogHandler)
    if (options.changelog) {
      await this.changelogHandler.displayChangelogs(plan, options.verbose)
    }

    // Interactive selection if enabled
    let finalPlan = plan
    if (options.interactive) {
      finalPlan = await this.interactiveSelection(plan)
      if (!finalPlan.updates.length) {
        cliOutput.print(StyledText.iconWarning(t('command.update.noUpdatesSelected')))
        return null
      }
    }

    // AI batch analysis if enabled (uses AIAnalysisHandler)
    if (options.ai) {
      await this.aiAnalysisHandler.analyzeAndDisplay(finalPlan, {
        workspace: options.workspace,
        provider: options.provider,
        analysisType: options.analysisType,
        skipCache: options.skipCache,
        verbose: options.verbose,
        force: options.force,
      })
    }

    return finalPlan
  }

  /**
   * Handle errors during execute()
   * QUAL-007: Uses unified error handling from commandHelpers
   */
  private handleExecuteError(
    error: unknown,
    progressBar: ProgressBar,
    options: UpdateCommandOptions
  ): never | undefined {
    // Use unified error handling - returns true if user cancellation was handled
    const wasCancelled = handleCommandError(error, {
      verbose: options.verbose,
      progressBar,
      errorMessage: 'Update command failed',
      context: { options },
    })

    if (wasCancelled) {
      return
    }

    throw error
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
   * Prepare update context by loading config and merging with CLI options
   */
  private async prepareUpdateContext(options: UpdateCommandOptions): Promise<{
    config: PackageFilterConfig
    updateOptions: UpdateOptions
    formatter: OutputFormatter
  }> {
    // Load configuration using shared helper
    const config = await loadConfiguration(options.workspace)

    // Create output formatter using shared helper
    const formatter = createFormatter(options.format, config, options.color !== false)

    // Merge CLI options with configuration file settings using shared helpers
    const updateOptions: UpdateOptions = {
      workspacePath: options.workspace,
      catalogName: options.catalog,
      target: getEffectiveTarget(options.target, config.defaults?.target),
      includePrerelease: mergeWithConfig(
        options.prerelease,
        config.defaults?.includePrerelease,
        false
      ),
      include: getEffectivePatterns(options.include, config.include),
      exclude: getEffectivePatterns(options.exclude, config.exclude),
      interactive: mergeWithConfig(options.interactive, config.defaults?.interactive, false),
      dryRun: mergeWithConfig(options.dryRun, config.defaults?.dryRun, false),
      force: options.force ?? false,
      createBackup: mergeWithConfig(options.createBackup, config.defaults?.createBackup, true),
      noSecurity: options.noSecurity,
    }

    return { config, updateOptions, formatter }
  }

  /**
   * Execute updates or show dry-run preview
   */
  private async executeUpdatesOrDryRun(
    finalPlan: UpdatePlan,
    updateOptions: UpdateOptions,
    options: UpdateCommandOptions,
    formatter: OutputFormatter
  ): Promise<void> {
    if (!options.dryRun) {
      // Create new progress bar for applying updates
      const progressBar = new ProgressBar({
        text: t('command.update.applyingUpdates'),
        total: finalPlan.updates.length,
      })
      progressBar.start(t('command.update.applyingUpdates'))

      const result = await this.updateService.executeUpdates(finalPlan, updateOptions)
      progressBar.succeed(t('command.update.appliedUpdates', { count: finalPlan.updates.length }))

      cliOutput.print(formatter.formatUpdateResult(result))

      // Run pnpm install if enabled (default: true)
      // ARCH-002: Delegated to InstallHandler
      if (options.install !== false) {
        await this.installHandler.runInstall(
          updateOptions.workspacePath || process.cwd(),
          options.verbose
        )
      }
    } else {
      cliOutput.print(StyledText.iconInfo(t('command.update.dryRunHint')))
      cliOutput.print(formatter.formatUpdatePlan(finalPlan))
    }
  }

  /**
   * Validate command options
   * QUAL-002: Uses unified validator from validators/
   */
  static validateOptions(options: UpdateCommandOptions): string[] {
    return errorsOnly(validateUpdateOptions)(options)
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
  --create-backup        Create backup files before updating (default: true)
  --no-backup            Skip creating backup before updating
  --install              Run pnpm install after update (default: true)
  --no-install           Skip pnpm install after update
  --verbose              Show detailed information
  --no-color             Disable colored output

Examples:
  pcu update                          # Update all catalogs (with backup and pnpm install)
  pcu update --interactive            # Interactive update selection
  pcu update --dry-run               # Preview updates without applying
  pcu update --no-backup             # Update without creating backup
  pcu update --no-install            # Update catalogs without running pnpm install
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
