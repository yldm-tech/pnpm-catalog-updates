/**
 * Command Helpers
 *
 * Shared utilities for CLI command initialization and common patterns.
 * Reduces code duplication across check, update, and other commands.
 */

import type { PackageFilterConfig } from '@pcu/utils'
import { ConfigLoader, Logger, logger, t } from '@pcu/utils'
import { type OutputFormat, OutputFormatter } from '../formatters/outputFormatter.js'
import { StyledText, ThemeManager } from '../themes/colorTheme.js'

/**
 * Common command options shared across multiple commands
 */
export interface CommonCommandOptions {
  workspace?: string
  format?: OutputFormat
  color?: boolean
  verbose?: boolean
}

/**
 * Command context created during initialization
 */
export interface CommandContext {
  config: PackageFilterConfig
  formatter: OutputFormatter
  workspacePath: string
}

/**
 * Command initialization options
 */
export interface InitOptions {
  /** Theme to use (default: 'default') */
  theme?: 'default' | 'minimal' | 'neon' | 'modern'
  /** Whether to show verbose initialization info */
  showVerboseInfo?: boolean
  /** Additional info to show in verbose mode */
  verboseInfo?: Record<string, string | undefined>
}

/**
 * Initialize theme for a command
 * Common pattern used in: checkCommand, updateCommand, securityCommand, etc.
 */
export function initializeTheme(
  theme: 'default' | 'minimal' | 'neon' | 'modern' = 'default'
): void {
  ThemeManager.setTheme(theme)
}

/**
 * Load and merge configuration with CLI options
 * Common pattern used in: checkCommand, updateCommand, watchCommand
 */
export async function loadConfiguration(workspacePath?: string): Promise<PackageFilterConfig> {
  const effectivePath = workspacePath || process.cwd()
  return ConfigLoader.loadConfig(effectivePath)
}

/**
 * Create an output formatter with common configuration
 * Common pattern used in: checkCommand, updateCommand, analyzeCommand, workspaceCommand
 */
export function createFormatter(
  format: OutputFormat | undefined,
  config: PackageFilterConfig,
  colorEnabled: boolean = true
): OutputFormatter {
  const effectiveFormat = format || config.defaults?.format || 'table'
  return new OutputFormatter(effectiveFormat as OutputFormat, colorEnabled)
}

/**
 * Initialize a command with common setup
 * Combines theme initialization, config loading, and formatter creation
 */
export async function initializeCommand(
  options: CommonCommandOptions,
  initOptions: InitOptions = {}
): Promise<CommandContext> {
  // Initialize theme
  initializeTheme(initOptions.theme)

  // Set logger to debug level when verbose mode is enabled
  if (options.verbose) {
    Logger.setGlobalLevel('debug')
  }

  // Show verbose initialization info
  if (initOptions.showVerboseInfo && options.verbose) {
    showVerboseInfo(options, initOptions.verboseInfo)
  }

  // Load configuration
  const workspacePath = options.workspace || process.cwd()
  const config = await loadConfiguration(workspacePath)

  // Create formatter
  const formatter = createFormatter(options.format, config, options.color !== false)

  return {
    config,
    formatter,
    workspacePath,
  }
}

/**
 * Show verbose initialization information
 */
function showVerboseInfo(
  options: CommonCommandOptions,
  additionalInfo?: Record<string, string | undefined>
): void {
  console.log(StyledText.iconAnalysis(t('info.checkingUpdates')))
  console.log(
    StyledText.muted(`${t('command.workspace.title')}: ${options.workspace || process.cwd()}`)
  )

  if (additionalInfo) {
    for (const [key, value] of Object.entries(additionalInfo)) {
      if (value !== undefined) {
        console.log(StyledText.muted(`${key}: ${value}`))
      }
    }
  }

  console.log('')
}

/**
 * Handle command error with consistent logging
 * Common pattern used in: checkCommand, updateCommand
 */
export function handleCommandError(
  error: Error | unknown,
  errorMessage: string,
  options: { verbose?: boolean },
  context?: Record<string, unknown>
): void {
  logger.error(errorMessage, error instanceof Error ? error : undefined, context)
  console.error(StyledText.iconError(t('cli.error')))
  console.error(StyledText.error(String(error)))

  if (options.verbose && error instanceof Error) {
    console.error(StyledText.muted(t('common.stackTrace')))
    console.error(StyledText.muted(error.stack || t('common.noStackTrace')))
  }
}

/**
 * Merge CLI options with config defaults
 * Returns the effective value prioritizing CLI > config > fallback
 */
export function mergeWithConfig<T>(
  cliValue: T | undefined,
  configValue: T | undefined,
  fallback: T
): T {
  return cliValue ?? configValue ?? fallback
}

/**
 * Get effective target from options and config
 */
export function getEffectiveTarget(
  optionTarget: string | undefined,
  configTarget: string | undefined
): 'latest' | 'greatest' | 'minor' | 'patch' | 'newest' {
  return (optionTarget || configTarget || 'latest') as
    | 'latest'
    | 'greatest'
    | 'minor'
    | 'patch'
    | 'newest'
}

/**
 * Get effective include/exclude patterns
 * CLI options take priority over config file
 */
export function getEffectivePatterns(
  cliPatterns: string[] | undefined,
  configPatterns: string[] | undefined
): string[] | undefined {
  return cliPatterns?.length ? cliPatterns : configPatterns
}
