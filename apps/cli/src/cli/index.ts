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
import { ConfigLoader, logger, VersionChecker } from '@pcu/utils'
import chalk from 'chalk'
import { Command } from 'commander'
import { AiCommand } from './commands/aiCommand.js'
import { AnalyzeCommand } from './commands/analyzeCommand.js'
import { CheckCommand } from './commands/checkCommand.js'
import { InitCommand } from './commands/initCommand.js'
import { SecurityCommand } from './commands/securityCommand.js'
import { ThemeCommand } from './commands/themeCommand.js'
import { UpdateCommand } from './commands/updateCommand.js'
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
          console.log(chalk.blue('Please run your command again to use the updated version.'))
          return true
        }
      }
    } catch (error) {
      // Silently fail version check to not interrupt CLI usage (only show warning in verbose mode)
      logger.debug('Version check failed', {
        error: error instanceof Error ? error.message : error,
      })
      if (process.argv.includes('-v') || process.argv.includes('--verbose')) {
        console.warn(chalk.yellow('⚠️  Could not check for updates:'), error)
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
    .description('check for outdated catalog dependencies')
    .option('--catalog <name>', 'check specific catalog only')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .option(
      '-t, --target <type>',
      'update target: latest, greatest, minor, patch, newest',
      'latest'
    )
    .option('--prerelease', 'include prerelease versions')
    .option('--include <pattern>', 'include packages matching pattern', [])
    .option('--exclude <pattern>', 'exclude packages matching pattern', [])
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
        })
        process.exit(0)
      } catch (error) {
        logger.error('Check command failed', error instanceof Error ? error : undefined, {
          command: 'check',
        })
        console.error(chalk.red('❌ Error:'), error)
        process.exit(1)
      }
    })

  // Update command
  program
    .command('update')
    .alias('u')
    .description('update catalog dependencies')
    .option('-i, --interactive', 'interactive mode to choose updates')
    .option('-d, --dry-run', 'preview changes without writing files')
    .option(
      '-t, --target <type>',
      'update target: latest, greatest, minor, patch, newest',
      'latest'
    )
    .option('--catalog <name>', 'update specific catalog only')
    .option('--include <pattern>', 'include packages matching pattern', [])
    .option('--exclude <pattern>', 'exclude packages matching pattern', [])
    .option('--force', 'force updates even if risky')
    .option('--prerelease', 'include prerelease versions')
    .option('-b, --create-backup', 'create backup files before updating')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .option('--ai', 'enable AI-powered batch analysis for all updates')
    .option('--provider <name>', 'AI provider: auto, claude, gemini, codex', 'auto')
    .option(
      '--analysis-type <type>',
      'AI analysis type: impact, security, compatibility, recommend',
      'impact'
    )
    .option('--skip-cache', 'skip AI analysis cache')
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
        })
        process.exit(0)
      } catch (error) {
        logger.error('Update command failed', error instanceof Error ? error : undefined, {
          command: 'update',
        })
        console.error(chalk.red('❌ Error:'), error)
        process.exit(1)
      }
    })

  // Analyze command
  program
    .command('analyze')
    .alias('a')
    .description('analyze the impact of updating a specific dependency')
    .argument('<package>', 'package name')
    .argument('[version]', 'new version (default: latest)')
    .option('--catalog <name>', 'catalog name (auto-detected if not specified)')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .option('--no-ai', 'disable AI-powered analysis')
    .option('--provider <name>', 'AI provider: auto, claude, gemini, codex', 'auto')
    .option(
      '--analysis-type <type>',
      'AI analysis type: impact, security, compatibility, recommend',
      'impact'
    )
    .option('--skip-cache', 'skip AI analysis cache')
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
        process.exit(0)
      } catch (error) {
        logger.error('Analyze command failed', error instanceof Error ? error : undefined, {
          command: 'analyze',
        })
        console.error(chalk.red('❌ Error:'), error)
        process.exit(1)
      }
    })

  // Workspace command
  program
    .command('workspace')
    .alias('w')
    .description('workspace information and validation')
    .option('--validate', 'validate workspace configuration')
    .option('-s, --stats', 'show workspace statistics')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts()
        const workspaceCommand = new WorkspaceCommand(services.workspaceService)

        const exitCode = await workspaceCommand.execute({
          workspace: globalOptions.workspace,
          validate: options.validate,
          stats: options.stats,
          format: options.format,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        })
        process.exit(exitCode)
      } catch (error) {
        logger.error('Workspace command failed', error instanceof Error ? error : undefined, {
          command: 'workspace',
        })
        console.error(chalk.red('❌ Error:'), error)
        process.exit(1)
      }
    })

  // Theme command
  program
    .command('theme')
    .alias('t')
    .description('configure color theme')
    .option('-s, --set <theme>', 'set theme: default, modern, minimal, neon')
    .option('-l, --list', 'list available themes')
    .option('-i, --interactive', 'interactive theme selection')
    .action(async (options) => {
      try {
        const themeCommand = new ThemeCommand()
        await themeCommand.execute({
          set: options.set,
          list: options.list,
          interactive: options.interactive,
        })
        process.exit(0)
      } catch (error) {
        logger.error('Theme command failed', error instanceof Error ? error : undefined, {
          command: 'theme',
        })
        console.error(chalk.red('❌ Error:'), error)
        process.exit(1)
      }
    })

  // Security command
  program
    .command('security')
    .alias('sec')
    .description('security vulnerability scanning and automated fixes')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .option('--audit', 'perform npm audit scan (default: true)', true)
    .option('--fix-vulns', 'automatically fix vulnerabilities')
    .option('--severity <level>', 'filter by severity: low, moderate, high, critical')
    .option('--include-dev', 'include dev dependencies in scan')
    .option('--snyk', 'include Snyk scan (requires snyk CLI)')
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
        process.exit(0)
      } catch (error) {
        logger.error('Security command failed', error instanceof Error ? error : undefined, {
          command: 'security',
        })
        console.error(chalk.red('❌ Error:'), error)
        process.exit(1)
      }
    })

  // Init command
  program
    .command('init')
    .alias('i')
    .description('initialize PCU configuration and PNPM workspace')
    .option('--force', 'overwrite existing configuration file')
    .option('--full', 'generate full configuration with all options')
    .option(
      '--create-workspace',
      'create PNPM workspace structure if missing (default: true)',
      true
    )
    .option('--no-create-workspace', 'skip creating PNPM workspace structure')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
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
        process.exit(0)
      } catch (error) {
        logger.error('Init command failed', error instanceof Error ? error : undefined, {
          command: 'init',
        })
        console.error(chalk.red('❌ Error:'), error)
        process.exit(1)
      }
    })

  // AI command
  program
    .command('ai')
    .description('check AI provider status and availability')
    .option('--status', 'show status of all AI providers (default)')
    .option('--test', 'test AI analysis with a sample request')
    .option('--cache-stats', 'show AI analysis cache statistics')
    .option('--clear-cache', 'clear AI analysis cache')
    .action(async (options) => {
      try {
        const aiCommand = new AiCommand()
        await aiCommand.execute({
          status: options.status,
          test: options.test,
          cacheStats: options.cacheStats,
          clearCache: options.clearCache,
        })
        process.exit(0)
      } catch (error) {
        logger.error('AI command failed', error instanceof Error ? error : undefined, {
          command: 'ai',
        })
        console.error(chalk.red('❌ Error:'), error)
        process.exit(1)
      }
    })

  // Help command
  program
    .command('help')
    .alias('h')
    .argument('[command]', 'command to get help for')
    .description('display help for command')
    .action((command) => {
      if (command) {
        const cmd = program.commands.find((c) => c.name() === command)
        if (cmd) {
          cmd.help()
        } else {
          console.log(chalk.red(`Unknown command: ${command}`))
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
      console.log(chalk.gray('Checking for updates...'))
      const versionResult = await VersionChecker.checkVersion(packageJson.version, {
        skipPrompt: false,
        timeout: 5000, // Longer timeout for explicit version check
      })

      if (versionResult.shouldPrompt) {
        const didUpdate = await VersionChecker.promptAndUpdate(versionResult)
        if (didUpdate) {
          console.log(chalk.blue('Please run your command again to use the updated version.'))
          process.exit(0)
        }
      } else if (versionResult.isLatest) {
        console.log(chalk.green('You are using the latest version!'))
      }
    } catch (error) {
      // Silently fail update check for version command
      logger.debug('Version flag update check failed', {
        error: error instanceof Error ? error.message : error,
      })
      if (args.includes('-v') || args.includes('--verbose')) {
        console.warn(chalk.yellow('⚠️  Could not check for updates:'), error)
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
    .description('A CLI tool to check and update pnpm workspace catalog dependencies')
    .option('--version', 'show version information')
    .option('-v, --verbose', 'enable verbose logging')
    .option('-w, --workspace <path>', 'workspace directory path')
    .option('--no-color', 'disable colored output')
    .option('-u, --update', 'shorthand for update command')
    .option('-c, --check', 'shorthand for check command')
    .option('-a, --analyze', 'shorthand for analyze command')
    .option('-s, --workspace-info', 'shorthand for workspace command')
    .option('-t, --theme', 'shorthand for theme command')
    .option('--security-audit', 'shorthand for security command')
    .option('--security-fix', 'shorthand for security --fix-vulns command')

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
    logger.error('CLI parse error', error instanceof Error ? error : undefined, { args })
    console.error(chalk.red('❌ Unexpected error:'), error)
    if (error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack))
    }
    process.exit(1)
  }
}

// Run the CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Fatal CLI error', error instanceof Error ? error : undefined)
    console.error(chalk.red('❌ Fatal error:'), error)
    process.exit(1)
  })
}
