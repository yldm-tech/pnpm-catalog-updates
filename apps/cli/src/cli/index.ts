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
// Services and Dependencies
import type { AnalysisType } from '@pcu/core'
import {
  CatalogUpdateService,
  FileSystemService,
  FileWorkspaceRepository,
  WorkspaceService,
} from '@pcu/core'
// CLI Commands
import { ConfigLoader, isCommandExitError, logger, t, VersionChecker } from '@pcu/utils'
import chalk from 'chalk'
import { Command } from 'commander'
import { AiCommand } from './commands/aiCommand.js'
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

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))

/**
 * Create service dependencies with configuration support
 */
function createServices(workspacePath?: string) {
  const fileSystemService = new FileSystemService()
  const workspaceRepository = new FileWorkspaceRepository(fileSystemService)
  // Use factory method to create CatalogUpdateService with configuration
  const catalogUpdateService = CatalogUpdateService.createWithConfig(
    workspaceRepository,
    workspacePath
  )
  const workspaceService = new WorkspaceService(workspaceRepository)

  return {
    fileSystemService,
    workspaceRepository,
    catalogUpdateService,
    workspaceService,
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
  config: ReturnType<typeof ConfigLoader.loadConfig>
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
 */
function registerCommands(program: Command, services: ReturnType<typeof createServices>): void {
  // Check command
  program
    .command('check')
    .alias('chk')
    .description(t('cli.description.check'))
    .option('--catalog <name>', t('cli.option.catalog'))
    .option('-f, --format <type>', t('cli.option.format'), 'table')
    .option('-t, --target <type>', t('cli.option.target'), 'latest')
    .option('--prerelease', t('cli.option.prerelease'))
    .option('--include <pattern>', t('cli.option.include'), [])
    .option('--exclude <pattern>', t('cli.option.exclude'), [])
    .option('--exit-code', t('cli.option.exitCode'))
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()
        const checkCommand = new CheckCommand(services.catalogUpdateService)

        await checkCommand.execute({
          workspace: globalOptions.workspace,
          catalog: options.catalog,
          format: options.format,
          target: options.target,
          prerelease: options.prerelease,
          include: Array.isArray(options.include)
            ? options.include
            : [options.include].filter(Boolean),
          exclude: Array.isArray(options.exclude)
            ? options.exclude
            : [options.exclude].filter(Boolean),
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
          exitCode: options.exitCode,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('Check command failed', error instanceof Error ? error : undefined, {
          command: 'check',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
      }
    })

  // Update command
  program
    .command('update')
    .alias('u')
    .description(t('cli.description.update'))
    .option('-i, --interactive', t('cli.option.interactive'))
    .option('-d, --dry-run', t('cli.option.dryRun'))
    .option('-t, --target <type>', t('cli.option.target'), 'latest')
    .option('--catalog <name>', t('cli.option.catalog'))
    .option('--include <pattern>', t('cli.option.include'), [])
    .option('--exclude <pattern>', t('cli.option.exclude'), [])
    .option('--force', t('cli.option.force'))
    .option('--prerelease', t('cli.option.prerelease'))
    .option('-b, --create-backup', t('cli.option.createBackup'))
    .option('-f, --format <type>', t('cli.option.format'), 'table')
    .option('--ai', t('cli.option.ai'))
    .option('--provider <name>', t('cli.option.provider'), 'auto')
    .option('--analysis-type <type>', t('cli.option.analysisType'), 'impact')
    .option('--skip-cache', t('cli.option.skipCache'))
    .option('--install', t('cli.option.install'), true)
    .option('--no-install', t('cli.option.noInstall'))
    .option('--changelog', t('cli.option.changelog'))
    .option('--no-changelog', t('cli.option.noChangelog'))
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()
        const updateCommand = new UpdateCommand(services.catalogUpdateService)

        await updateCommand.execute({
          workspace: globalOptions.workspace,
          catalog: options.catalog,
          format: options.format,
          target: options.target,
          interactive: options.interactive,
          dryRun: options.dryRun,
          force: options.force,
          prerelease: options.prerelease,
          include: Array.isArray(options.include)
            ? options.include
            : [options.include].filter(Boolean),
          exclude: Array.isArray(options.exclude)
            ? options.exclude
            : [options.exclude].filter(Boolean),
          createBackup: options.createBackup,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
          // AI batch analysis options
          ai: parseBooleanFlag(options.ai),
          provider: options.provider,
          analysisType: options.analysisType as AnalysisType,
          skipCache: parseBooleanFlag(options.skipCache),
          // Auto install option
          install: options.install,
          // Changelog display option
          changelog: options.changelog,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('Update command failed', error instanceof Error ? error : undefined, {
          command: 'update',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
      }
    })

  // Analyze command
  program
    .command('analyze')
    .alias('a')
    .description(t('cli.description.analyze'))
    .argument('<package>', t('cli.argument.package'))
    .argument('[version]', t('cli.argument.version'))
    .option('--catalog <name>', t('cli.option.catalog'))
    .option('-f, --format <type>', t('cli.option.format'), 'table')
    .option('--no-ai', t('cli.option.noAi'))
    .option('--provider <name>', t('cli.option.provider'), 'auto')
    .option('--analysis-type <type>', t('cli.option.analysisType'), 'impact')
    .option('--skip-cache', t('cli.option.skipCache'))
    .action(async (packageName, version, options, command) => {
      try {
        const globalOptions = command.parent.opts()
        const analyzeCommand = new AnalyzeCommand(
          services.catalogUpdateService,
          services.workspaceService
        )

        await analyzeCommand.execute(packageName, version, {
          workspace: globalOptions.workspace,
          catalog: options.catalog,
          format: options.format,
          ai: options.ai,
          provider: options.provider,
          analysisType: options.analysisType as AnalysisType,
          skipCache: parseBooleanFlag(options.skipCache),
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('Analyze command failed', error instanceof Error ? error : undefined, {
          command: 'analyze',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
      }
    })

  // Workspace command
  program
    .command('workspace')
    .alias('w')
    .description(t('cli.description.workspace'))
    .option('--validate', t('cli.option.validate'))
    .option('-s, --stats', t('cli.option.stats'))
    .option('-f, --format <type>', t('cli.option.format'), 'table')
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()
        const workspaceCommand = new WorkspaceCommand(services.workspaceService)

        await workspaceCommand.execute({
          workspace: globalOptions.workspace,
          validate: options.validate,
          stats: options.stats,
          format: options.format,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('Workspace command failed', error instanceof Error ? error : undefined, {
          command: 'workspace',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
      }
    })

  // Theme command
  program
    .command('theme')
    .alias('t')
    .description(t('cli.description.theme'))
    .option('-s, --set <theme>', t('cli.option.setTheme'))
    .option('-l, --list', t('cli.option.listThemes'))
    .option('-i, --interactive', t('cli.option.interactive'))
    .action(async (options) => {
      try {
        const themeCommand = new ThemeCommand()
        await themeCommand.execute({
          set: options.set,
          list: options.list,
          interactive: options.interactive,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('Theme command failed', error instanceof Error ? error : undefined, {
          command: 'theme',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
      }
    })

  // Security command
  program
    .command('security')
    .alias('sec')
    .description(t('cli.description.security'))
    .option('-f, --format <type>', t('cli.option.format'), 'table')
    .option('--audit', t('cli.option.audit'), true)
    .option('--fix-vulns', t('cli.option.fixVulns'))
    .option('--severity <level>', t('cli.option.severity'))
    .option('--include-dev', t('cli.option.includeDev'))
    .option('--snyk', t('cli.option.snyk'))
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()
        const formatter = new OutputFormatter(
          options.format as OutputFormat,
          !globalOptions.noColor
        )
        const securityCommand = new SecurityCommand(formatter)

        await securityCommand.execute({
          workspace: globalOptions.workspace,
          format: options.format,
          audit: options.audit,
          fixVulns: options.fixVulns,
          severity: options.severity,
          includeDev: options.includeDev,
          snyk: options.snyk,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('Security command failed', error instanceof Error ? error : undefined, {
          command: 'security',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
      }
    })

  // Init command
  program
    .command('init')
    .alias('i')
    .description(t('cli.description.init'))
    .option('--force', t('cli.option.forceOverwrite'))
    .option('--full', t('cli.option.full'))
    .option('--create-workspace', t('cli.option.createWorkspace'), true)
    .option('--no-create-workspace', t('cli.option.noCreateWorkspace'))
    .option('-f, --format <type>', t('cli.option.format'), 'table')
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()
        const initCommand = new InitCommand()

        await initCommand.execute({
          workspace: globalOptions.workspace,
          force: options.force,
          full: options.full,
          createWorkspace: options.createWorkspace,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('Init command failed', error instanceof Error ? error : undefined, {
          command: 'init',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
      }
    })

  // AI command
  program
    .command('ai')
    .description(t('cli.description.ai'))
    .option('--status', t('cli.option.status'))
    .option('--test', t('cli.option.test'))
    .option('--cache-stats', t('cli.option.cacheStats'))
    .option('--clear-cache', t('cli.option.clearCache'))
    .action(async (options) => {
      try {
        const aiCommand = new AiCommand()
        await aiCommand.execute({
          status: options.status,
          test: options.test,
          cacheStats: options.cacheStats,
          clearCache: options.clearCache,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('AI command failed', error instanceof Error ? error : undefined, {
          command: 'ai',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
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
        const cacheCommand = new CacheCommand()

        await cacheCommand.execute({
          stats: options.stats,
          clear: options.clear,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('Cache command failed', error instanceof Error ? error : undefined, {
          command: 'cache',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
      }
    })

  // Rollback command
  program
    .command('rollback')
    .alias('rb')
    .description(t('cli.description.rollback'))
    .option('-l, --list', t('cli.option.listBackups'))
    .option('--latest', t('cli.option.restoreLatest'))
    .option('--delete-all', t('cli.option.deleteAllBackups'))
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()
        const rollbackCommand = new RollbackCommand()

        await rollbackCommand.execute({
          workspace: globalOptions.workspace,
          list: options.list,
          latest: options.latest,
          deleteAll: options.deleteAll,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('Rollback command failed', error instanceof Error ? error : undefined, {
          command: 'rollback',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
      }
    })

  // Watch command
  program
    .command('watch')
    .alias('wch')
    .description(t('cli.description.watch'))
    .option('--catalog <name>', t('cli.option.catalog'))
    .option('-f, --format <type>', t('cli.option.format'), 'table')
    .option('-t, --target <type>', t('cli.option.target'), 'latest')
    .option('--prerelease', t('cli.option.prerelease'))
    .option('--include <pattern>', t('cli.option.include'), [])
    .option('--exclude <pattern>', t('cli.option.exclude'), [])
    .option('--debounce <ms>', t('cli.option.debounce'), '300')
    .option('--clear', t('cli.option.clearConsole'))
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()
        const watchCommand = new WatchCommand(services.catalogUpdateService)

        await watchCommand.execute({
          workspace: globalOptions.workspace,
          catalog: options.catalog,
          format: options.format,
          target: options.target,
          prerelease: options.prerelease,
          include: Array.isArray(options.include)
            ? options.include
            : [options.include].filter(Boolean),
          exclude: Array.isArray(options.exclude)
            ? options.exclude
            : [options.exclude].filter(Boolean),
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
          debounce: parseInt(options.debounce, 10),
          clear: options.clear,
        })
      } catch (error) {
        if (isCommandExitError(error)) {
          process.exit(error.exitCode)
        }
        logger.error('Watch command failed', error instanceof Error ? error : undefined, {
          command: 'watch',
        })
        console.error(chalk.red(`❌ ${t('cli.error')}`), error)
        process.exit(1)
      }
    })

  // Help command
  program
    .command('help')
    .alias('h')
    .argument('[command]', t('cli.argument.command'))
    .description(t('cli.description.help'))
    .action((command) => {
      if (command) {
        const cmd = program.commands.find((c) => c.name() === command)
        if (cmd) {
          cmd.help()
        } else {
          console.log(chalk.red(t('cli.unknownCommand', { command })))
        }
      } else {
        program.help()
      }
    })
}

/**
 * Handle shorthand options by rewriting arguments
 */
function handleShorthandArgs(args: string[]): string[] {
  const rewrittenArgs = [...args]

  // Map single-letter command 'i' -> init (changed from interactive mode)
  if (
    rewrittenArgs.includes('i') &&
    !rewrittenArgs.some(
      (a) =>
        a === 'init' ||
        a === 'update' ||
        a === '-u' ||
        a === '--update' ||
        a === '-i' ||
        a === '--interactive'
    )
  ) {
    const index = rewrittenArgs.indexOf('i')
    rewrittenArgs.splice(index, 1, 'init')
  }

  if (rewrittenArgs.includes('-u') || rewrittenArgs.includes('--update')) {
    const index = rewrittenArgs.findIndex((arg) => arg === '-u' || arg === '--update')
    rewrittenArgs.splice(index, 1, 'update')
  } else if (
    (rewrittenArgs.includes('-i') || rewrittenArgs.includes('--interactive')) &&
    !rewrittenArgs.some((a) => a === 'update' || a === '-u' || a === '--update')
  ) {
    // Map standalone -i to `update -i`
    const index = rewrittenArgs.findIndex((arg) => arg === '-i' || arg === '--interactive')
    rewrittenArgs.splice(index, 1, 'update', '-i')
  } else if (rewrittenArgs.includes('-c') || rewrittenArgs.includes('--check')) {
    const index = rewrittenArgs.findIndex((arg) => arg === '-c' || arg === '--check')
    rewrittenArgs.splice(index, 1, 'check')
  } else if (rewrittenArgs.includes('-a') || rewrittenArgs.includes('--analyze')) {
    const index = rewrittenArgs.findIndex((arg) => arg === '-a' || arg === '--analyze')
    rewrittenArgs.splice(index, 1, 'analyze')
  } else if (rewrittenArgs.includes('-s') || rewrittenArgs.includes('--workspace-info')) {
    const index = rewrittenArgs.findIndex((arg) => arg === '-s' || arg === '--workspace-info')
    rewrittenArgs.splice(index, 1, 'workspace')
  } else if (rewrittenArgs.includes('-t') || rewrittenArgs.includes('--theme')) {
    const index = rewrittenArgs.findIndex((arg) => arg === '-t' || arg === '--theme')
    rewrittenArgs.splice(index, 1, 'theme')
  } else if (rewrittenArgs.includes('--security-audit')) {
    const index = rewrittenArgs.indexOf('--security-audit')
    rewrittenArgs.splice(index, 1, 'security')
  } else if (rewrittenArgs.includes('--security-fix')) {
    const index = rewrittenArgs.indexOf('--security-fix')
    rewrittenArgs.splice(index, 1, 'security', '--fix-vulns')
  }

  return rewrittenArgs
}

/**
 * Handle custom --version with update checking
 */
async function handleVersionFlag(
  args: string[],
  config: ReturnType<typeof ConfigLoader.loadConfig>
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

  // Parse arguments first to get workspace path
  let workspacePath: string | undefined

  // Extract workspace path from arguments for service creation
  const workspaceIndex = process.argv.findIndex((arg) => arg === '-w' || arg === '--workspace')
  if (workspaceIndex !== -1 && workspaceIndex + 1 < process.argv.length) {
    workspacePath = process.argv[workspaceIndex + 1]
  }

  // Load configuration to check if version updates are enabled
  const config = ConfigLoader.loadConfig(workspacePath || process.cwd())

  // Check for version updates (skip in CI environments or if disabled)
  const didUpdate = await checkForUpdates(config)
  if (didUpdate) {
    process.exit(0)
  }

  // Create services with workspace path for configuration loading
  const services = createServices(workspacePath)

  // Configure the main command
  program
    .name('pcu')
    .description(t('cli.description.main'))
    .option('--version', t('cli.option.version'))
    .option('-v, --verbose', t('cli.option.verbose'))
    .option('-w, --workspace <path>', t('cli.option.workspace'))
    .option('--no-color', t('cli.option.noColor'))
    .option('-u, --update', t('cli.option.updateShorthand'))
    .option('-c, --check', t('cli.option.checkShorthand'))
    .option('-a, --analyze', t('cli.option.analyzeShorthand'))
    .option('-s, --workspace-info', t('cli.option.workspaceShorthand'))
    .option('-t, --theme', t('cli.option.themeShorthand'))
    .option('--security-audit', t('cli.option.securityAudit'))
    .option('--security-fix', t('cli.option.securityFix'))

  // Register all commands
  registerCommands(program, services)

  // Handle shorthand options and single-letter commands by rewriting arguments
  const args = handleShorthandArgs([...process.argv])

  // Show help if no arguments provided
  if (args.length <= 2) {
    program.help()
  }

  // Handle custom --version with update checking
  await handleVersionFlag(args, config)

  // Parse command line arguments
  try {
    await program.parseAsync(args)
  } catch (error) {
    if (isCommandExitError(error)) {
      process.exit(error.exitCode)
    }
    logger.error('CLI parse error', error instanceof Error ? error : undefined, { args })
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
    logger.error('Fatal CLI error', error instanceof Error ? error : undefined)
    console.error(chalk.red(`❌ ${t('cli.fatalError')}`), error)
    process.exit(1)
  })
}
