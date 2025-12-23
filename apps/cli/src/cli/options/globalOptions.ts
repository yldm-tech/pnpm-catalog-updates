/**
 * Global CLI Options
 *
 * Defines standardized option definitions for all CLI commands.
 * Provides consistent option parsing and validation.
 */

import { t } from '@pcu/utils'
import { Option } from 'commander'

/**
 * Raw CLI options input from commander (unvalidated)
 */
interface RawCliOptions {
  workspace?: unknown
  verbose?: unknown
  color?: unknown
  registry?: unknown
  timeout?: unknown
  config?: unknown
  catalog?: unknown
  format?: unknown
  target?: unknown
  prerelease?: unknown
  include?: unknown
  exclude?: unknown
  interactive?: unknown
  dryRun?: unknown
  force?: unknown
  createBackup?: unknown
  ai?: unknown
  provider?: unknown
  analysisType?: unknown
  skipCache?: unknown
  validate?: unknown
  stats?: unknown
  info?: unknown
  silent?: unknown
}

export interface GlobalCliOptions {
  workspace?: string
  verbose?: boolean
  color?: boolean
  registry?: string
  timeout?: number
  config?: string
}

export interface CheckCliOptions extends GlobalCliOptions {
  catalog?: string
  format?: 'table' | 'json' | 'yaml' | 'minimal'
  target?: 'latest' | 'greatest' | 'minor' | 'patch' | 'newest'
  prerelease?: boolean
  include?: string[]
  exclude?: string[]
}

export interface UpdateCliOptions extends CheckCliOptions {
  interactive?: boolean
  dryRun?: boolean
  force?: boolean
  createBackup?: boolean
}

export interface AnalyzeCliOptions extends GlobalCliOptions {
  format?: 'table' | 'json' | 'yaml' | 'minimal'
  ai?: boolean
  provider?: 'auto' | 'claude' | 'gemini' | 'codex'
  analysisType?: 'impact' | 'security' | 'compatibility' | 'recommend'
  skipCache?: boolean
}

export interface WorkspaceCliOptions extends GlobalCliOptions {
  validate?: boolean
  stats?: boolean
  info?: boolean
  format?: 'table' | 'json' | 'yaml' | 'minimal'
}

/**
 * Global options available to all commands
 */
export const globalOptions = [
  new Option('-w, --workspace <path>', t('option.workspacePath')).env('PCU_WORKSPACE'),

  new Option('-v, --verbose', t('option.verboseLogging')).env('PCU_VERBOSE'),

  new Option('--no-color', t('option.noColorOutput')).env('PCU_NO_COLOR'),

  new Option('--registry <url>', t('option.registryUrl')).env('PCU_REGISTRY'),

  new Option('--timeout <ms>', t('option.timeout')).argParser(parseInt).env('PCU_TIMEOUT'),

  new Option('--config <path>', t('option.configPath')).env('PCU_CONFIG'),
]

/**
 * Check command specific options
 */
export const checkOptions = [
  ...globalOptions,

  new Option('--catalog <name>', t('option.catalogOnly')).env('PCU_CATALOG'),

  new Option('-f, --format <type>', t('option.outputFormat'))
    .choices(['table', 'json', 'yaml', 'minimal'])
    .default('table')
    .env('PCU_OUTPUT_FORMAT'),

  new Option('-t, --target <type>', t('option.updateTarget'))
    .choices(['latest', 'greatest', 'minor', 'patch', 'newest'])
    .default('latest')
    .env('PCU_UPDATE_TARGET'),

  new Option('--prerelease', t('option.prereleaseVersions')).env('PCU_PRERELEASE'),

  new Option('--include <pattern...>', t('option.includePattern')).env('PCU_INCLUDE'),

  new Option('--exclude <pattern...>', t('option.excludePattern')).env('PCU_EXCLUDE'),
]

/**
 * Update command specific options
 */
export const updateOptions = [
  ...checkOptions,

  new Option('-i, --interactive', t('option.interactiveMode')).env('PCU_INTERACTIVE'),

  new Option('-d, --dry-run', t('option.dryRunPreview')).env('PCU_DRY_RUN'),

  new Option('--force', t('option.forceRisky')).env('PCU_FORCE'),

  new Option('--create-backup', t('option.backupFiles')).env('PCU_CREATE_BACKUP'),
]

/**
 * Analyze command specific options
 */
export const analyzeOptions = [
  ...globalOptions,

  new Option('-f, --format <type>', t('option.outputFormat'))
    .choices(['table', 'json', 'yaml', 'minimal'])
    .default('table')
    .env('PCU_OUTPUT_FORMAT'),

  new Option('--ai', t('option.aiAnalysis')).env('PCU_AI_ENABLED'),

  new Option('--provider <name>', t('option.aiProvider'))
    .choices(['auto', 'claude', 'gemini', 'codex'])
    .default('auto')
    .env('PCU_AI_PROVIDER'),

  new Option('--analysis-type <type>', t('option.analysisTypeOpt'))
    .choices(['impact', 'security', 'compatibility', 'recommend'])
    .default('impact')
    .env('PCU_AI_ANALYSIS_TYPE'),

  new Option('--skip-cache', t('option.skipAiCache')).env('PCU_AI_SKIP_CACHE'),
]

/**
 * Workspace command specific options
 */
export const workspaceOptions = [
  ...globalOptions,

  new Option('--validate', t('option.validateWorkspace')),

  new Option('--stats', t('option.showStats')),

  new Option('--info', t('option.showInfo')),

  new Option('-f, --format <type>', t('option.outputFormat'))
    .choices(['table', 'json', 'yaml', 'minimal'])
    .default('table')
    .env('PCU_OUTPUT_FORMAT'),
]

/**
 * Option groups for better help organization
 */
export const optionGroups = {
  global: {
    title: t('optionGroup.global'),
    options: globalOptions,
  },
  output: {
    title: t('optionGroup.output'),
    options: [
      new Option('-f, --format <type>', t('option.outputFormat'))
        .choices(['table', 'json', 'yaml', 'minimal'])
        .default('table'),
      new Option('--no-color', t('option.noColorOutput')),
      new Option('-v, --verbose', t('option.verboseLogging')),
    ],
  },
  filtering: {
    title: t('optionGroup.filtering'),
    options: [
      new Option('--catalog <name>', t('option.catalogOnly')),
      new Option('--include <pattern...>', t('option.includePattern')),
      new Option('--exclude <pattern...>', t('option.excludePattern')),
    ],
  },
  update: {
    title: t('optionGroup.update'),
    options: [
      new Option('-t, --target <type>', t('option.updateTarget'))
        .choices(['latest', 'greatest', 'minor', 'patch', 'newest'])
        .default('latest'),
      new Option('--prerelease', t('option.prereleaseVersions')),
      new Option('-i, --interactive', t('option.interactiveMode')),
      new Option('-d, --dry-run', t('option.dryRunPreview')),
      new Option('--force', t('option.forceRisky')),
      new Option('--create-backup', t('option.backupFiles')),
    ],
  },
  registry: {
    title: t('optionGroup.registry'),
    options: [
      new Option('--registry <url>', t('option.registryUrl')),
      new Option('--timeout <ms>', t('option.timeout')).argParser(parseInt),
    ],
  },
}

/**
 * Utility functions for option handling
 */
export class OptionUtils {
  private static parseBoolean(value: unknown): boolean {
    if (value === undefined || value === null) return false
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === '') return false
      if (['false', '0', 'no', 'off', 'n'].includes(normalized)) return false
      if (['true', '1', 'yes', 'on', 'y'].includes(normalized)) return true
      return true
    }
    return Boolean(value)
  }

  /**
   * Parse and validate global options
   */
  static parseGlobalOptions(options: RawCliOptions): GlobalCliOptions {
    const parsed: GlobalCliOptions = {}

    if (options.workspace) {
      parsed.workspace = String(options.workspace).trim()
    }

    if (options.verbose !== undefined) {
      parsed.verbose = OptionUtils.parseBoolean(options.verbose)
    }

    if (options.color !== undefined) {
      parsed.color = OptionUtils.parseBoolean(options.color)
    }

    if (options.registry) {
      parsed.registry = String(options.registry).trim()
    }

    if (options.timeout) {
      const timeout = parseInt(String(options.timeout), 10)
      if (!Number.isNaN(timeout) && timeout > 0) {
        parsed.timeout = timeout
      }
    }

    if (options.config) {
      parsed.config = String(options.config).trim()
    }

    return parsed
  }

  /**
   * Parse check command options
   */
  static parseCheckOptions(options: RawCliOptions): CheckCliOptions {
    const global = OptionUtils.parseGlobalOptions(options)
    const check: CheckCliOptions = { ...global }

    if (options.catalog) {
      check.catalog = String(options.catalog).trim()
    }

    if (options.format && typeof options.format === 'string') {
      check.format = options.format as Exclude<CheckCliOptions['format'], undefined>
    }

    if (options.target && typeof options.target === 'string') {
      check.target = options.target as Exclude<CheckCliOptions['target'], undefined>
    }

    if (options.prerelease !== undefined) {
      check.prerelease = OptionUtils.parseBoolean(options.prerelease)
    }

    if (options.include) {
      check.include = Array.isArray(options.include)
        ? options.include.map((p: unknown) => String(p).trim()).filter(Boolean)
        : [String(options.include).trim()].filter(Boolean)
    }

    if (options.exclude) {
      check.exclude = Array.isArray(options.exclude)
        ? options.exclude.map((p: unknown) => String(p).trim()).filter(Boolean)
        : [String(options.exclude).trim()].filter(Boolean)
    }

    return check
  }

  /**
   * Parse update command options
   */
  static parseUpdateOptions(options: RawCliOptions): UpdateCliOptions {
    const check = OptionUtils.parseCheckOptions(options)
    const update: UpdateCliOptions = { ...check }

    if (options.interactive !== undefined) {
      update.interactive = OptionUtils.parseBoolean(options.interactive)
    }

    if (options.dryRun !== undefined) {
      update.dryRun = OptionUtils.parseBoolean(options.dryRun)
    }

    if (options.force !== undefined) {
      update.force = OptionUtils.parseBoolean(options.force)
    }

    if (options.createBackup !== undefined) {
      update.createBackup = OptionUtils.parseBoolean(options.createBackup)
    }

    return update
  }

  /**
   * Parse analyze command options
   */
  static parseAnalyzeOptions(options: RawCliOptions): AnalyzeCliOptions {
    const global = OptionUtils.parseGlobalOptions(options)
    const analyze: AnalyzeCliOptions = { ...global }

    if (options.format && typeof options.format === 'string') {
      analyze.format = options.format as Exclude<AnalyzeCliOptions['format'], undefined>
    }

    if (options.ai !== undefined) {
      analyze.ai = OptionUtils.parseBoolean(options.ai)
    }

    if (options.provider && typeof options.provider === 'string') {
      analyze.provider = options.provider as Exclude<AnalyzeCliOptions['provider'], undefined>
    }

    if (options.analysisType && typeof options.analysisType === 'string') {
      analyze.analysisType = options.analysisType as Exclude<
        AnalyzeCliOptions['analysisType'],
        undefined
      >
    }

    if (options.skipCache !== undefined) {
      analyze.skipCache = OptionUtils.parseBoolean(options.skipCache)
    }

    return analyze
  }

  /**
   * Parse workspace command options
   */
  static parseWorkspaceOptions(options: RawCliOptions): WorkspaceCliOptions {
    const global = OptionUtils.parseGlobalOptions(options)
    const workspace: WorkspaceCliOptions = { ...global }

    if (options.validate !== undefined) {
      workspace.validate = OptionUtils.parseBoolean(options.validate)
    }

    if (options.stats !== undefined) {
      workspace.stats = OptionUtils.parseBoolean(options.stats)
    }

    if (options.info !== undefined) {
      workspace.info = OptionUtils.parseBoolean(options.info)
    }

    if (options.format && typeof options.format === 'string') {
      workspace.format = options.format as Exclude<WorkspaceCliOptions['format'], undefined>
    }

    return workspace
  }

  /**
   * Generate help text for option group
   */
  static generateHelpText(groupName: keyof typeof optionGroups): string {
    const group = optionGroups[groupName]
    if (!group) return ''

    const lines = [`${group.title}:`]

    for (const option of group.options) {
      const flags = option.flags
      const description = option.description || ''
      const choices = option.argChoices ? ` (choices: ${option.argChoices.join(', ')})` : ''
      const defaultValue = option.defaultValue ? ` (default: ${option.defaultValue})` : ''

      lines.push(`  ${flags.padEnd(30)} ${description}${choices}${defaultValue}`)
    }

    return lines.join('\n')
  }

  /**
   * Validate option combinations
   */
  static validateOptionCombinations(command: string, options: RawCliOptions): string[] {
    const errors: string[] = []

    switch (command) {
      case 'update':
        if (
          OptionUtils.parseBoolean(options.interactive) &&
          OptionUtils.parseBoolean(options.dryRun)
        ) {
          errors.push(t('validation.interactiveWithDryRun'))
        }
        break

      case 'workspace': {
        const actionCount = [options.validate, options.stats, options.info].filter((v) =>
          OptionUtils.parseBoolean(v)
        ).length
        if (actionCount > 1) {
          errors.push(t('validation.multipleWorkspaceActions'))
        }
        if (actionCount === 0) {
          // Default to info
          options.info = true
        }
        break
      }
    }

    // Global validations
    if (OptionUtils.parseBoolean(options.verbose) && OptionUtils.parseBoolean(options.silent)) {
      errors.push(t('validation.verboseWithSilent'))
    }

    return errors
  }
}
