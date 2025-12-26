/**
 * Interactive Options Collector
 *
 * Minimal interactive prompts - only ask what's truly necessary.
 * Philosophy: defaults over questions, action over configuration.
 */

import * as p from '@clack/prompts'
import { t } from '@pcu/utils'
import chalk from 'chalk'
import { commonSchemas, mergeOptions, type OptionsSchema } from './optionUtils.js'

const theme = {
  primary: chalk.cyan,
  success: chalk.green,
  muted: chalk.gray,
}

/**
 * Handle user cancellation
 */
function handleCancel(): never {
  p.cancel(t('interactive.cancelled'))
  process.exit(0)
}

/**
 * Common choices for select prompts
 */
export const choices = {
  target: [
    { value: 'latest', label: 'latest', hint: t('interactive.choice.target.latestHint') },
    { value: 'minor', label: 'minor', hint: t('interactive.choice.target.minorHint') },
    { value: 'patch', label: 'patch', hint: t('interactive.choice.target.patchHint') },
  ],
  theme: [
    { value: 'default', label: t('prompt.themeDefault') },
    { value: 'modern', label: t('prompt.themeModern') },
    { value: 'minimal', label: t('prompt.themeMinimal') },
    { value: 'neon', label: t('prompt.themeNeon') },
  ],
  format: [
    { value: 'table', label: 'table' },
    { value: 'json', label: 'json' },
    { value: 'yaml', label: 'yaml' },
    { value: 'minimal', label: 'minimal' },
  ],
  severity: [
    { value: undefined, label: 'all' },
    { value: 'critical', label: 'critical' },
    { value: 'high', label: 'high' },
    { value: 'medium', label: 'medium' },
    { value: 'low', label: 'low' },
  ],
  analysisType: [
    { value: 'impact', label: 'impact' },
    { value: 'security', label: 'security' },
    { value: 'compatibility', label: 'compatibility' },
    { value: 'recommend', label: 'recommend' },
  ],
  provider: [
    { value: 'auto', label: 'auto' },
    { value: 'claude', label: 'claude' },
    { value: 'gemini', label: 'gemini' },
    { value: 'codex', label: 'codex' },
  ],
}

/**
 * Commander Option interface for type safety
 */
interface CommanderOption {
  attributeName: () => string
}

/**
 * Commander Command interface for type safety
 */
interface CommanderCommand {
  options?: readonly CommanderOption[]
  getOptionValueSource?: (key: string) => string | undefined
}

/**
 * Check if any meaningful options were provided by the user (not default values)
 */
export function hasProvidedOptions(
  options: Record<string, unknown>,
  command?: CommanderCommand,
  excludeKeys: string[] = []
): boolean {
  const allKeys = command?.options?.map((opt) => opt.attributeName()) ?? Object.keys(options)
  const keysToCheck = allKeys.filter((key) => !excludeKeys.includes(key))

  return keysToCheck.some((key) => {
    const value = options[key]
    if (value === undefined || value === null) return false

    if (command?.getOptionValueSource) {
      const source = command.getOptionValueSource(key)
      if (source === 'default' || source === undefined) {
        return false
      }
    }

    if (typeof value === 'boolean') return true
    if (typeof value === 'string') return value.trim() !== ''
    if (Array.isArray(value)) return value.length > 0
    return true
  })
}

/**
 * Option schemas for each command
 */
const checkOptionsSchema = {
  catalog: commonSchemas.catalog,
  format: commonSchemas.format,
  target: commonSchemas.target,
  prerelease: commonSchemas.prerelease,
  include: commonSchemas.include,
  exclude: commonSchemas.exclude,
  exitCode: { type: 'boolean' as const, default: false },
} satisfies OptionsSchema<CheckOptions>

type CheckOptions = {
  catalog?: string
  format: string
  target: string
  prerelease: boolean
  include: string[]
  exclude: string[]
  exitCode: boolean
}

type UpdateOptions = {
  catalog?: string
  format: string
  target: string
  interactive: boolean
  dryRun: boolean
  force: boolean
  prerelease: boolean
  include: string[]
  exclude: string[]
  createBackup: boolean
  ai: boolean
  provider: string
  analysisType: string
  install: boolean
  changelog: boolean
}

const updateOptionsSchema = {
  catalog: commonSchemas.catalog,
  format: commonSchemas.format,
  target: commonSchemas.target,
  interactive: { type: 'boolean' as const, default: true },
  dryRun: commonSchemas.dryRun,
  force: commonSchemas.force,
  prerelease: commonSchemas.prerelease,
  include: commonSchemas.include,
  exclude: commonSchemas.exclude,
  createBackup: { type: 'boolean' as const, default: true },
  ai: commonSchemas.ai,
  provider: commonSchemas.provider,
  analysisType: commonSchemas.analysisType,
  install: { type: 'boolean' as const, default: true },
  changelog: { type: 'boolean' as const, default: false },
} satisfies OptionsSchema<UpdateOptions>

type WorkspaceOptions = {
  validate: boolean
  stats: boolean
  format: string
}

const workspaceOptionsSchema = {
  validate: { type: 'boolean' as const, default: false },
  stats: { type: 'boolean' as const, default: true },
  format: commonSchemas.format,
} satisfies OptionsSchema<WorkspaceOptions>

type SecurityOptions = {
  format: string
  audit: boolean
  fixVulns: boolean
  severity?: string
  includeDev: boolean
  snyk: boolean
}

const securityOptionsSchema = {
  format: commonSchemas.format,
  audit: { type: 'boolean' as const, default: true },
  fixVulns: { type: 'boolean' as const, default: false },
  severity: commonSchemas.catalog, // optional-string
  includeDev: { type: 'boolean' as const, default: false },
  snyk: { type: 'boolean' as const, default: false },
} satisfies OptionsSchema<SecurityOptions>

type InitOptions = {
  force: boolean
  full: boolean
  createWorkspace: boolean
}

const initOptionsSchema = {
  force: commonSchemas.force,
  full: { type: 'boolean' as const, default: false },
  createWorkspace: { type: 'boolean' as const, default: true },
} satisfies OptionsSchema<InitOptions>

type CacheOptions = {
  stats: boolean
  clear: boolean
}

const cacheOptionsSchema = {
  stats: { type: 'boolean' as const, default: true },
  clear: { type: 'boolean' as const, default: false },
} satisfies OptionsSchema<CacheOptions>

type WatchOptions = {
  catalog?: string
  format: string
  target: string
  prerelease: boolean
  include: string[]
  exclude: string[]
  debounce: number
  clear: boolean
}

const watchOptionsSchema = {
  catalog: commonSchemas.catalog,
  format: commonSchemas.format,
  target: commonSchemas.target,
  prerelease: commonSchemas.prerelease,
  include: commonSchemas.include,
  exclude: commonSchemas.exclude,
  debounce: { type: 'number' as const, default: 300 },
  clear: { type: 'boolean' as const, default: false },
} satisfies OptionsSchema<WatchOptions>

/**
 * Interactive Options Collector - Minimal prompts, sensible defaults
 */
export class InteractiveOptionsCollector {
  /**
   * Check command - no interaction needed, just use defaults
   */
  async collectCheckOptions(existingOptions: Record<string, unknown> = {}): Promise<CheckOptions> {
    return mergeOptions(existingOptions, checkOptionsSchema)
  }

  /**
   * Update command - only ask for target version strategy
   */
  async collectUpdateOptions(
    existingOptions: Record<string, unknown> = {}
  ): Promise<UpdateOptions> {
    p.intro(theme.primary('pcu update'))

    // Only ask for target if not already provided
    let target = existingOptions.target as string
    if (!target) {
      const result = await p.select({
        message: t('interactive.update.updateTarget'),
        options: choices.target,
        initialValue: 'latest',
      })
      if (p.isCancel(result)) handleCancel()
      target = result as string
    }

    p.outro(theme.success(t('interactive.update.ready')))

    // Merge with schema defaults, override target with user selection
    return { ...mergeOptions(existingOptions, updateOptionsSchema), target }
  }

  /**
   * Analyze command - only ask for package name if not provided
   */
  async collectAnalyzeOptions(existingOptions: Record<string, unknown> = {}): Promise<{
    packageName: string
    version?: string
    catalog?: string
    format: string
    ai: boolean
    provider: string
    analysisType: string
  }> {
    p.intro(theme.primary('pcu analyze'))

    // Only ask for package name if not provided
    let packageName = existingOptions.packageName as string
    if (!packageName) {
      const result = await p.text({
        message: t('interactive.analyze.packageName'),
        placeholder: 'lodash, react, ...',
        validate: (value) => {
          if (!value.trim()) return t('interactive.analyze.packageNameRequired')
          return undefined
        },
      })
      if (p.isCancel(result)) handleCancel()
      packageName = result as string
    }

    p.outro(theme.success(t('interactive.analyze.ready')))

    return {
      packageName,
      version: (existingOptions.version as string) || undefined,
      catalog: (existingOptions.catalog as string) || undefined,
      format: (existingOptions.format as string) || 'table',
      ai: (existingOptions.ai as boolean) ?? true,
      provider: (existingOptions.provider as string) || 'auto',
      analysisType: (existingOptions.analysisType as string) || 'impact',
    }
  }

  /**
   * Workspace command - no interaction needed, use defaults
   */
  async collectWorkspaceOptions(
    existingOptions: Record<string, unknown> = {}
  ): Promise<WorkspaceOptions> {
    return mergeOptions(existingOptions, workspaceOptionsSchema)
  }

  /**
   * Theme command - ask which theme to set
   */
  async collectThemeOptions(existingOptions: Record<string, unknown> = {}): Promise<{
    set?: string
    list: boolean
  }> {
    if (existingOptions.list || existingOptions.set) {
      return {
        set: existingOptions.set as string,
        list: (existingOptions.list as boolean) ?? false,
      }
    }

    p.intro(theme.primary('pcu theme'))

    const result = await p.select({
      message: t('interactive.theme.choose'),
      options: choices.theme,
    })
    if (p.isCancel(result)) handleCancel()

    // Don't call p.outro() here - let the command display its own output
    return { set: result as string, list: false }
  }

  /**
   * Security command - no interaction needed, defaults to audit
   */
  async collectSecurityOptions(
    existingOptions: Record<string, unknown> = {}
  ): Promise<SecurityOptions> {
    return mergeOptions(existingOptions, securityOptionsSchema)
  }

  /**
   * Init command - no interaction needed, use quick mode
   */
  async collectInitOptions(existingOptions: Record<string, unknown> = {}): Promise<InitOptions> {
    return mergeOptions(existingOptions, initOptionsSchema)
  }

  /**
   * Cache command - no interaction needed, defaults to stats
   */
  async collectCacheOptions(existingOptions: Record<string, unknown> = {}): Promise<CacheOptions> {
    return mergeOptions(existingOptions, cacheOptionsSchema)
  }

  /**
   * Rollback command - ask what action to take
   */
  async collectRollbackOptions(existingOptions: Record<string, unknown> = {}): Promise<{
    list: boolean
    latest: boolean
    deleteAll: boolean
  }> {
    // Skip if action already specified
    if (existingOptions.list || existingOptions.latest || existingOptions.deleteAll) {
      return {
        list: (existingOptions.list as boolean) ?? false,
        latest: (existingOptions.latest as boolean) ?? false,
        deleteAll: (existingOptions.deleteAll as boolean) ?? false,
      }
    }

    p.intro(theme.primary('pcu rollback'))

    const result = await p.select({
      message: t('interactive.rollback.action'),
      options: [
        { value: 'list', label: t('interactive.rollback.action.list') },
        { value: 'latest', label: t('interactive.rollback.action.latest') },
        { value: 'deleteAll', label: t('interactive.rollback.action.deleteAll') },
      ],
    })
    if (p.isCancel(result)) handleCancel()

    return {
      list: result === 'list',
      latest: result === 'latest',
      deleteAll: result === 'deleteAll',
    }
  }

  /**
   * Watch command - no interaction needed, use defaults
   */
  async collectWatchOptions(existingOptions: Record<string, unknown> = {}): Promise<WatchOptions> {
    return mergeOptions(existingOptions, watchOptionsSchema)
  }
}

/**
 * Singleton instance for convenience
 */
export const interactiveOptionsCollector = new InteractiveOptionsCollector()
