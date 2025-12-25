#!/usr/bin/env node

/**
 * pnpm-catalog-updates CLI Entry Point
 *
 * A CLI tool for checking and updating pnpm workspace catalog dependencies.
 * This is the main entry point that handles command parsing and execution.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Import ExitPromptError for proper instanceof checking (QUAL-004 fix)
import { ExitPromptError } from '@inquirer/core'
// Services and Dependencies
import type { AnalysisType } from '@pcu/core'
import {
  CatalogUpdateService,
  FileSystemService,
  FileWorkspaceRepository,
  WorkspaceService,
} from '@pcu/core'
// CLI Commands
import { ConfigLoader, I18n, isCommandExitError, logger, t, VersionChecker } from '@pcu/utils'

/**
 * Check if error is an ExitPromptError from @inquirer/core (user pressed Ctrl+C)
 * Uses instanceof as primary method, with fallbacks for cross-realm scenarios
 */
function isExitPromptError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  // Primary: instanceof check (most reliable when in same realm)
  if (error instanceof ExitPromptError) return true

  // Fallback 1: Check by name property (for cross-realm scenarios)
  if ('name' in error && (error as { name: string }).name === 'ExitPromptError') return true

  // Fallback 2: Check by constructor name (for edge cases)
  if (error.constructor?.name === 'ExitPromptError') return true

  return false
}

/**
 * Unified command error handler to reduce code duplication (QUAL-003)
 * Handles common error types: CommandExitError, ExitPromptError, and general errors
 */
function handleCommandError(error: unknown, commandName: string): never {
  // Handle structured exit codes
  if (isCommandExitError(error)) {
    process.exit(error.exitCode)
  }

  // Handle user cancellation (Ctrl+C) gracefully
  if (isExitPromptError(error)) {
    console.log(chalk.gray(`\n${t('cli.cancelled')}`))
    process.exit(0)
  }

  // Log and display general errors
  logger.error(`${commandName} command failed`, error instanceof Error ? error : undefined, {
    command: commandName,
  })
  console.error(chalk.red(`❌ ${t('cli.error')}`), error)
  process.exit(1)
}

import chalk from 'chalk'
import { Command, Option } from 'commander'
import { AnalyzeCommand } from './commands/analyzeCommand.js'
import { CacheCommand } from './commands/cacheCommand.js'
import { CheckCommand } from './commands/checkCommand.js'
import { InitCommand } from './commands/initCommand.js'
import { RollbackCommand } from './commands/rollbackCommand.js'
import { SecurityCommand } from './commands/securityCommand.js'
import { ThemeCommand } from './commands/themeCommand.js'
import { UpdateCommand } from './commands/updateCommand.js'
import { WatchCommand } from './commands/watchCommand.js'
import { WorkspaceCommand } from './commands/workspaceCommand.js'
import { type OutputFormat, OutputFormatter } from './formatters/outputFormatter.js'
import {
  hasProvidedOptions,
  interactiveOptionsCollector,
} from './interactive/InteractiveOptionsCollector.js'

/**
 * CLI Option Choices - provides auto-completion and validation in --help
 */
const CLI_CHOICES = {
  format: ['table', 'json', 'yaml', 'minimal'] as const,
  target: ['latest', 'greatest', 'minor', 'patch', 'newest'] as const,
  provider: ['auto', 'claude', 'gemini', 'codex'] as const,
  analysisType: ['impact', 'security', 'compatibility', 'recommend'] as const,
  severity: ['low', 'moderate', 'high', 'critical'] as const,
} as const

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))

/**
 * Service type definitions
 */
type Services = {
  fileSystemService: FileSystemService
  workspaceRepository: FileWorkspaceRepository
  catalogUpdateService: CatalogUpdateService
  workspaceService: WorkspaceService
}

/**
 * Lazy service factory - creates services only when first accessed
 * Solves QUAL-005: Services were previously created eagerly even for --help
 */
class LazyServiceFactory {
  private services: Services | null = null
  private workspacePath?: string

  constructor(workspacePath?: string) {
    this.workspacePath = workspacePath
  }

  /**
   * Get services, creating them lazily on first access
   */
  get(): Services {
    if (!this.services) {
      const fileSystemService = new FileSystemService()
      const workspaceRepository = new FileWorkspaceRepository(fileSystemService)
      const catalogUpdateService = CatalogUpdateService.createWithConfig(
        workspaceRepository,
        this.workspacePath
      )
      const workspaceService = new WorkspaceService(workspaceRepository)

      this.services = {
        fileSystemService,
        workspaceRepository,
        catalogUpdateService,
        workspaceService,
      }
    }
    return this.services
  }
}

function parseBooleanFlag(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '') return false
    if (['false', '0', 'no', 'off', 'n'].includes(normalized)) return false
    if (['true', '1', 'yes', 'on', 'y'].includes(normalized)) return true
    // Commander env() 会把任意非空字符串塞进来；未知字符串按"启用"处理
    return true
  }
  return Boolean(value)
}

/**
 * Check for version updates at startup
 */
async function checkForUpdates(
  config: Awaited<ReturnType<typeof ConfigLoader.loadConfig>>
): Promise<boolean> {
  if (VersionChecker.shouldCheckForUpdates() && config.advanced?.checkForUpdates !== false) {
    try {
      const versionResult = await VersionChecker.checkVersion(packageJson.version, {
        skipPrompt: false,
        timeout: 3000, // Short timeout to not delay CLI startup
      })

      if (versionResult.shouldPrompt) {
        const didUpdate = await VersionChecker.promptAndUpdate(versionResult)
        if (didUpdate) {
          // Exit after successful update to allow user to restart with new version
          console.log(chalk.blue(t('cli.runAgain')))
          return true
        }
      }
    } catch (error) {
      // Silently fail version check to not interrupt CLI usage (only show warning in verbose mode)
      logger.debug('Version check failed', {
        error: error instanceof Error ? error.message : error,
      })
      if (process.argv.includes('-v') || process.argv.includes('--verbose')) {
        console.warn(chalk.yellow(`⚠️  ${t('cli.couldNotCheckUpdates')}`), error)
      }
    }
  }
  return false
}

/**
 * Register all CLI commands
 * Uses lazy service factory to defer service instantiation until command execution
 */
function registerCommands(program: Command, serviceFactory: LazyServiceFactory): void {
  // Check command
  program
    .command('check')
    .description(t('cli.description.check'))
    .option('-i, --interactive', t('cli.option.interactive'))
    .option('--catalog <name>', t('cli.option.catalog'))
    .addOption(
      new Option('-f, --format <type>', t('cli.option.format'))
        .choices(CLI_CHOICES.format)
        .default('table')
    )
    .addOption(
      new Option('-t, --target <type>', t('cli.option.target'))
        .choices(CLI_CHOICES.target)
        .default('latest')
    )
    .option('--prerelease', t('cli.option.prerelease'))
    .option('--include <pattern>', t('cli.option.include'), [])
    .option('--exclude <pattern>', t('cli.option.exclude'), [])
    .option('--exit-code', t('cli.option.exitCode'))
    .option('--no-security', t('cli.option.noSecurity'))
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()

        // Check if any meaningful options were provided (not just defaults)
        // Options are automatically extracted from command definition
        // Exclude 'interactive' from the check since it controls mode, not data
        let finalOptions = options

        // Enter interactive mode if:
        // 1. Explicitly requested with -i/--interactive
        // 2. No other meaningful options provided
        if (options.interactive || !hasProvidedOptions(options, command, ['interactive'])) {
          // Enter interactive mode
          const collected = await interactiveOptionsCollector.collectCheckOptions({
            ...options,
            workspace: globalOptions.workspace,
          })
          finalOptions = { ...options, ...collected }
        }

        const services = serviceFactory.get()
        const checkCommand = new CheckCommand(services.catalogUpdateService)

        await checkCommand.execute({
          workspace: globalOptions.workspace,
          catalog: finalOptions.catalog,
          format: finalOptions.format,
          target: finalOptions.target,
          prerelease: finalOptions.prerelease,
          include: Array.isArray(finalOptions.include)
            ? finalOptions.include
            : [finalOptions.include].filter(Boolean),
          exclude: Array.isArray(finalOptions.exclude)
            ? finalOptions.exclude
            : [finalOptions.exclude].filter(Boolean),
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
          exitCode: finalOptions.exitCode,
          noSecurity: finalOptions.security === false,
        })
      } catch (error) {
        handleCommandError(error, 'check')
      }
    })

  // Update command
  program
    .command('update')
    .description(t('cli.description.update'))
    // Basic options
    .option('-i, --interactive', t('cli.option.interactive'))
    .option('-d, --dry-run', t('cli.option.dryRun'))
    .option('--force', t('cli.option.force'))
    .option('-b, --create-backup', t('cli.option.createBackup'))
    // Filter options
    .option('--catalog <name>', t('cli.option.catalog'))
    .option('--include <pattern>', t('cli.option.include'), [])
    .option('--exclude <pattern>', t('cli.option.exclude'), [])
    .addOption(
      new Option('-t, --target <type>', t('cli.option.target'))
        .choices(CLI_CHOICES.target)
        .default('latest')
    )
    .option('--prerelease', t('cli.option.prerelease'))
    // Output options
    .addOption(
      new Option('-f, --format <type>', t('cli.option.format'))
        .choices(CLI_CHOICES.format)
        .default('table')
    )
    .option('--changelog', t('cli.option.changelog'))
    .option('--no-changelog', t('cli.option.noChangelog'))
    // AI options
    .option('--ai', t('cli.option.ai'))
    .addOption(
      new Option('--provider <name>', t('cli.option.provider'))
        .choices(CLI_CHOICES.provider)
        .default('auto')
    )
    .addOption(
      new Option('--analysis-type <type>', t('cli.option.analysisType'))
        .choices(CLI_CHOICES.analysisType)
        .default('impact')
    )
    .option('--skip-cache', t('cli.option.skipCache'))
    // Post-update options
    .option('--install', t('cli.option.install'), true)
    .option('--no-install', t('cli.option.noInstall'))
    .option('--no-security', t('cli.option.noSecurity'))
    .addHelpText(
      'after',
      () => `
${t('cli.help.optionGroupsTitle')}
  ${t('cli.help.groupBasic')}    -i, -d, --force, -b
  ${t('cli.help.groupFilter')}   --catalog, --include, --exclude, -t, --prerelease
  ${t('cli.help.groupOutput')}   -f, --changelog
  ${t('cli.help.groupAI')}       --ai, --provider, --analysis-type, --skip-cache
  ${t('cli.help.groupInstall')}  --install, --no-security

${t('cli.help.tipLabel')} ${t('cli.help.tipContent', { locale: I18n.getLocale() })}
`
    )
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()

        // Check if any meaningful options were provided
        // Options are automatically extracted from command definition
        // Exclude 'interactive' from the check since it controls mode, not data
        let finalOptions = options

        // Enter interactive mode if:
        // 1. Explicitly requested with -i/--interactive
        // 2. No other meaningful options provided
        if (options.interactive || !hasProvidedOptions(options, command, ['interactive'])) {
          // Enter interactive mode
          const collected = await interactiveOptionsCollector.collectUpdateOptions({
            ...options,
            workspace: globalOptions.workspace,
          })
          finalOptions = { ...options, ...collected }
        }

        const services = serviceFactory.get()
        const updateCommand = new UpdateCommand(services.catalogUpdateService)

        await updateCommand.execute({
          workspace: globalOptions.workspace,
          catalog: finalOptions.catalog,
          format: finalOptions.format,
          target: finalOptions.target,
          interactive: finalOptions.interactive,
          dryRun: finalOptions.dryRun,
          force: finalOptions.force,
          prerelease: finalOptions.prerelease,
          include: Array.isArray(finalOptions.include)
            ? finalOptions.include
            : [finalOptions.include].filter(Boolean),
          exclude: Array.isArray(finalOptions.exclude)
            ? finalOptions.exclude
            : [finalOptions.exclude].filter(Boolean),
          createBackup: finalOptions.createBackup,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
          // AI batch analysis options
          ai: parseBooleanFlag(finalOptions.ai),
          provider: finalOptions.provider,
          analysisType: finalOptions.analysisType as AnalysisType,
          skipCache: parseBooleanFlag(finalOptions.skipCache),
          // Auto install option
          install: finalOptions.install,
          // Changelog display option
          changelog: finalOptions.changelog,
          // Skip security vulnerability checks
          noSecurity: finalOptions.security === false,
        })

        // Ensure process exits after interactive mode (stdin may keep event loop alive)
        if (finalOptions.interactive) {
          process.exit(0)
        }
      } catch (error) {
        handleCommandError(error, 'update')
      }
    })

  // Analyze command
  program
    .command('analyze')
    .description(t('cli.description.analyze'))
    .argument('[package]', t('cli.argument.package'))
    .argument('[version]', t('cli.argument.version'))
    .option('--catalog <name>', t('cli.option.catalog'))
    .addOption(
      new Option('-f, --format <type>', t('cli.option.format'))
        .choices(CLI_CHOICES.format)
        .default('table')
    )
    .option('--no-ai', t('cli.option.noAi'))
    .addOption(
      new Option('--provider <name>', t('cli.option.provider'))
        .choices(CLI_CHOICES.provider)
        .default('auto')
    )
    .addOption(
      new Option('--analysis-type <type>', t('cli.option.analysisType'))
        .choices(CLI_CHOICES.analysisType)
        .default('impact')
    )
    .option('--skip-cache', t('cli.option.skipCache'))
    .action(async (packageName, version, options, command) => {
      try {
        const globalOptions = command.parent.opts()

        let finalPackageName = packageName
        let finalVersion = version
        let finalOptions = options

        // If no package name provided, enter interactive mode
        if (!packageName) {
          const collected = await interactiveOptionsCollector.collectAnalyzeOptions({
            ...options,
            workspace: globalOptions.workspace,
          })
          finalPackageName = collected.packageName
          finalVersion = collected.version
          finalOptions = { ...options, ...collected }
        }

        const services = serviceFactory.get()
        const analyzeCommand = new AnalyzeCommand(
          services.catalogUpdateService,
          services.workspaceService
        )

        await analyzeCommand.execute(finalPackageName, finalVersion, {
          workspace: globalOptions.workspace,
          catalog: finalOptions.catalog,
          format: finalOptions.format,
          ai: finalOptions.ai,
          provider: finalOptions.provider,
          analysisType: finalOptions.analysisType as AnalysisType,
          skipCache: parseBooleanFlag(finalOptions.skipCache),
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        handleCommandError(error, 'analyze')
      }
    })

  // Workspace command
  program
    .command('workspace')
    .description(t('cli.description.workspace'))
    .option('--validate', t('cli.option.validate'))
    .option('--info', t('cli.option.stats'))
    .addOption(
      new Option('-f, --format <type>', t('cli.option.format'))
        .choices(CLI_CHOICES.format)
        .default('table')
    )
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()

        // Check if any meaningful options were provided
        // Options are automatically extracted from command definition
        let finalOptions = options

        if (!hasProvidedOptions(options, command)) {
          // No options provided, enter interactive mode
          const collected = await interactiveOptionsCollector.collectWorkspaceOptions({
            ...options,
            workspace: globalOptions.workspace,
          })
          finalOptions = { ...options, ...collected }
        }

        const services = serviceFactory.get()
        const workspaceCommand = new WorkspaceCommand(services.workspaceService)

        await workspaceCommand.execute({
          workspace: globalOptions.workspace,
          validate: finalOptions.validate,
          stats: finalOptions.info,
          format: finalOptions.format,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        handleCommandError(error, 'workspace')
      }
    })

  // Theme command
  program
    .command('theme')
    .description(t('cli.description.theme'))
    .option('-s, --set <theme>', t('cli.option.setTheme'))
    .option('-l, --list', t('cli.option.listThemes'))
    .option('-i, --interactive', t('cli.option.interactive'))
    .action(async (options, command) => {
      try {
        // Check if any meaningful options were provided (not just defaults)
        // Options are automatically extracted from command definition
        let finalOptions = options

        if (!hasProvidedOptions(options, command)) {
          // No options provided, enter interactive mode
          const collected = await interactiveOptionsCollector.collectThemeOptions(options)
          finalOptions = { ...options, ...collected }
        }

        const themeCommand = new ThemeCommand()
        await themeCommand.execute({
          set: finalOptions.set,
          list: finalOptions.list,
          interactive: finalOptions.interactive,
        })

        // Ensure process exits after interactive mode (stdin may keep event loop alive)
        process.exit(0)
      } catch (error) {
        handleCommandError(error, 'theme')
      }
    })

  // Security command
  program
    .command('security')
    .description(t('cli.description.security'))
    .addOption(
      new Option('-f, --format <type>', t('cli.option.format'))
        .choices(CLI_CHOICES.format)
        .default('table')
    )
    .option('--audit', t('cli.option.audit'), true)
    .option('--fix-vulns', t('cli.option.fixVulns'))
    .addOption(
      new Option('--severity <level>', t('cli.option.severity')).choices(CLI_CHOICES.severity)
    )
    .option('--include-dev', t('cli.option.includeDev'))
    .option('--snyk', t('cli.option.snyk'))
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()

        // Check if any meaningful options were provided
        // Options are automatically extracted from command definition
        let finalOptions = options

        if (!hasProvidedOptions(options, command)) {
          // No options provided, enter interactive mode
          const collected = await interactiveOptionsCollector.collectSecurityOptions({
            ...options,
            workspace: globalOptions.workspace,
          })
          finalOptions = { ...options, ...collected }
        }

        const formatter = new OutputFormatter(
          finalOptions.format as OutputFormat,
          !globalOptions.noColor
        )
        const securityCommand = new SecurityCommand(formatter)

        await securityCommand.execute({
          workspace: globalOptions.workspace,
          format: finalOptions.format,
          audit: finalOptions.audit,
          fixVulns: finalOptions.fixVulns,
          severity: finalOptions.severity,
          includeDev: finalOptions.includeDev,
          snyk: finalOptions.snyk,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        handleCommandError(error, 'security')
      }
    })

  // Init command
  program
    .command('init')
    .description(t('cli.description.init'))
    .option('--force', t('cli.option.forceOverwrite'))
    .option('--full', t('cli.option.full'))
    .option('--create-workspace', t('cli.option.createWorkspace'), true)
    .option('--no-create-workspace', t('cli.option.noCreateWorkspace'))
    .addOption(
      new Option('-f, --format <type>', t('cli.option.format'))
        .choices(CLI_CHOICES.format)
        .default('table')
    )
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()

        // Check if any meaningful options were provided
        // Options are automatically extracted from command definition
        let finalOptions = options

        if (!hasProvidedOptions(options, command)) {
          // No options provided, enter interactive mode
          const collected = await interactiveOptionsCollector.collectInitOptions({
            ...options,
            workspace: globalOptions.workspace,
          })
          finalOptions = { ...options, ...collected }
        }

        const initCommand = new InitCommand()

        await initCommand.execute({
          workspace: globalOptions.workspace,
          force: finalOptions.force,
          full: finalOptions.full,
          createWorkspace: finalOptions.createWorkspace,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        handleCommandError(error, 'init')
      }
    })

  // Cache command
  program
    .command('cache')
    .description(t('cli.description.cache'))
    .option('--stats', t('cli.option.stats'))
    .option('--clear', t('cli.option.clear'))
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()

        // Check if any meaningful options were provided
        // Options are automatically extracted from command definition
        let finalOptions = options

        if (!hasProvidedOptions(options, command)) {
          // No options provided, enter interactive mode
          const collected = await interactiveOptionsCollector.collectCacheOptions(options)
          finalOptions = { ...options, ...collected }
        }

        const cacheCommand = new CacheCommand()

        await cacheCommand.execute({
          stats: finalOptions.stats,
          clear: finalOptions.clear,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        handleCommandError(error, 'cache')
      }
    })

  // Rollback command
  program
    .command('rollback')
    .description(t('cli.description.rollback'))
    .option('-l, --list', t('cli.option.listBackups'))
    .option('--latest', t('cli.option.restoreLatest'))
    .option('--delete-all', t('cli.option.deleteAllBackups'))
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()

        // Check if any meaningful options were provided
        // Options are automatically extracted from command definition
        let finalOptions = options

        if (!hasProvidedOptions(options, command)) {
          // No options provided, enter interactive mode
          const collected = await interactiveOptionsCollector.collectRollbackOptions(options)
          finalOptions = { ...options, ...collected }
        }

        const rollbackCommand = new RollbackCommand()

        await rollbackCommand.execute({
          workspace: globalOptions.workspace,
          list: finalOptions.list,
          latest: finalOptions.latest,
          deleteAll: finalOptions.deleteAll,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        handleCommandError(error, 'rollback')
      }
    })

  // Watch command
  program
    .command('watch')
    .description(t('cli.description.watch'))
    .option('--catalog <name>', t('cli.option.catalog'))
    .addOption(
      new Option('-f, --format <type>', t('cli.option.format'))
        .choices(CLI_CHOICES.format)
        .default('table')
    )
    .addOption(
      new Option('-t, --target <type>', t('cli.option.target'))
        .choices(CLI_CHOICES.target)
        .default('latest')
    )
    .option('--prerelease', t('cli.option.prerelease'))
    .option('--include <pattern>', t('cli.option.include'), [])
    .option('--exclude <pattern>', t('cli.option.exclude'), [])
    .option('--debounce <ms>', t('cli.option.debounce'), '300')
    .option('--clear', t('cli.option.clearConsole'))
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()

        // Check if any meaningful options were provided
        // Options are automatically extracted from command definition
        let finalOptions = options

        if (!hasProvidedOptions(options, command)) {
          // No options provided, enter interactive mode
          const collected = await interactiveOptionsCollector.collectWatchOptions({
            ...options,
            workspace: globalOptions.workspace,
          })
          finalOptions = { ...options, ...collected }
        }

        const services = serviceFactory.get()
        const watchCommand = new WatchCommand(services.catalogUpdateService)

        await watchCommand.execute({
          workspace: globalOptions.workspace,
          catalog: finalOptions.catalog,
          format: finalOptions.format,
          target: finalOptions.target,
          prerelease: finalOptions.prerelease,
          include: Array.isArray(finalOptions.include)
            ? finalOptions.include
            : [finalOptions.include].filter(Boolean),
          exclude: Array.isArray(finalOptions.exclude)
            ? finalOptions.exclude
            : [finalOptions.exclude].filter(Boolean),
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
          debounce:
            typeof finalOptions.debounce === 'number'
              ? finalOptions.debounce
              : parseInt(finalOptions.debounce, 10),
          clear: finalOptions.clear,
        })
      } catch (error) {
        handleCommandError(error, 'watch')
      }
    })
}
/**
 * Handle custom --version with update checking
 */
async function handleVersionFlag(
  args: string[],
  config: Awaited<ReturnType<typeof ConfigLoader.loadConfig>>
): Promise<void> {
  if (!args.includes('--version')) return

  console.log(packageJson.version)

  // Check for updates if not in CI and enabled in config
  if (VersionChecker.shouldCheckForUpdates() && config.advanced?.checkForUpdates !== false) {
    try {
      console.log(chalk.gray(t('cli.checkingUpdates')))
      const versionResult = await VersionChecker.checkVersion(packageJson.version, {
        skipPrompt: false,
        timeout: 5000, // Longer timeout for explicit version check
      })

      if (versionResult.shouldPrompt) {
        const didUpdate = await VersionChecker.promptAndUpdate(versionResult)
        if (didUpdate) {
          console.log(chalk.blue(t('cli.runAgain')))
          process.exit(0)
        }
      } else if (versionResult.isLatest) {
        console.log(chalk.green(t('cli.latestVersion')))
      }
    } catch (error) {
      // Silently fail update check for version command
      logger.debug('Version flag update check failed', {
        error: error instanceof Error ? error.message : error,
      })
      if (args.includes('-v') || args.includes('--verbose')) {
        console.warn(chalk.yellow(`⚠️  ${t('cli.couldNotCheckUpdates')}`), error)
      }
    }
  }

  process.exit(0)
}

/**
 * Main CLI function
 */
export async function main(): Promise<void> {
  const program = new Command()

  // Configure Commander.js help text labels for i18n
  program.configureHelp({
    formatHelp: (cmd, helper) => {
      return helper.formatHelp(cmd, helper)
    },
  })

  // Parse arguments first to get workspace path
  let workspacePath: string | undefined

  // Extract workspace path from arguments for service creation
  const workspaceIndex = process.argv.findIndex((arg) => arg === '-w' || arg === '--workspace')
  if (workspaceIndex !== -1 && workspaceIndex + 1 < process.argv.length) {
    workspacePath = process.argv[workspaceIndex + 1]
  }

  // Load configuration to check if version updates are enabled
  const config = await ConfigLoader.loadConfig(workspacePath || process.cwd())

  // Initialize i18n with config locale (priority: config > env > system)
  I18n.init(config.locale)

  // Check for version updates (skip in CI environments or if disabled)
  const didUpdate = await checkForUpdates(config)
  if (didUpdate) {
    process.exit(0)
  }

  // Create lazy service factory - services will only be instantiated when actually needed
  // This means --help and --version won't trigger service creation
  const serviceFactory = new LazyServiceFactory(workspacePath)

  // Configure the main command
  program
    .name('pcu')
    .description(t('cli.description.main'))
    .helpCommand(t('cli.help.command'), t('cli.help.description'))
    .helpOption('-h, --help', t('cli.help.option'))
    .option('--version', t('cli.option.version'))
    .option('-v, --verbose', t('cli.option.verbose'))
    .option('-w, --workspace <path>', t('cli.option.workspace'))
    .option('--no-color', t('cli.option.noColor'))

  // Register all commands with lazy service factory
  registerCommands(program, serviceFactory)

  // Show help if no arguments provided
  if (process.argv.length <= 2) {
    program.help()
  }

  // Handle custom --version with update checking
  await handleVersionFlag(process.argv, config)

  // Parse command line arguments
  try {
    await program.parseAsync(process.argv)
  } catch (error) {
    if (isCommandExitError(error)) {
      process.exit(error.exitCode)
    }
    // Handle user cancellation (Ctrl+C) gracefully
    if (isExitPromptError(error)) {
      console.log(chalk.gray(`\n${t('cli.cancelled')}`))
      process.exit(0)
    }
    logger.error('CLI parse error', error instanceof Error ? error : undefined, {
      args: process.argv,
    })
    console.error(chalk.red(`❌ ${t('cli.unexpectedError')}`), error)
    if (error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack))
    }
    process.exit(1)
  }
}

// Run the CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    if (isCommandExitError(error)) {
      process.exit(error.exitCode)
    }
    // Handle user cancellation (Ctrl+C) gracefully
    if (isExitPromptError(error)) {
      console.log(chalk.gray(`\n${t('cli.cancelled')}`))
      process.exit(0)
    }
    logger.error('Fatal CLI error', error instanceof Error ? error : undefined)
    console.error(chalk.red(`❌ ${t('cli.fatalError')}`), error)
    process.exit(1)
  })
}
