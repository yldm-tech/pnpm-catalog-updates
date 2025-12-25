/**
 * Interactive Options Collector
 *
 * Minimal interactive prompts - only ask what's truly necessary.
 * Philosophy: defaults over questions, action over configuration.
 */

import * as p from '@clack/prompts'
import { t } from '@pcu/utils'
import chalk from 'chalk'

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
}

/** @deprecated Use choices instead */
export function getCommonChoices() {
  return {
    format: [
      { value: 'table', label: 'table' },
      { value: 'json', label: 'json' },
      { value: 'yaml', label: 'yaml' },
      { value: 'minimal', label: 'minimal' },
    ],
    target: choices.target,
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
    theme: choices.theme,
  }
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
  options?: CommanderOption[]
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
 * Interactive Options Collector - Minimal prompts, sensible defaults
 */
export class InteractiveOptionsCollector {
  /**
   * Check command - no interaction needed, just use defaults
   */
  async collectCheckOptions(existingOptions: Record<string, unknown> = {}): Promise<{
    catalog?: string
    format: string
    target: string
    prerelease: boolean
    include: string[]
    exclude: string[]
    exitCode: boolean
  }> {
    // No questions - just return defaults merged with existing options
    return {
      catalog: (existingOptions.catalog as string) || undefined,
      format: (existingOptions.format as string) || 'table',
      target: (existingOptions.target as string) || 'latest',
      prerelease: (existingOptions.prerelease as boolean) ?? false,
      include: (existingOptions.include as string[]) || [],
      exclude: (existingOptions.exclude as string[]) || [],
      exitCode: (existingOptions.exitCode as boolean) ?? false,
    }
  }

  /**
   * Update command - only ask for target version strategy
   */
  async collectUpdateOptions(existingOptions: Record<string, unknown> = {}): Promise<{
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
  }> {
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

    return {
      catalog: (existingOptions.catalog as string) || undefined,
      format: (existingOptions.format as string) || 'table',
      target,
      interactive: true,
      dryRun: (existingOptions.dryRun as boolean) ?? false,
      force: (existingOptions.force as boolean) ?? false,
      prerelease: (existingOptions.prerelease as boolean) ?? false,
      include: (existingOptions.include as string[]) || [],
      exclude: (existingOptions.exclude as string[]) || [],
      createBackup: true,
      ai: (existingOptions.ai as boolean) ?? false,
      provider: (existingOptions.provider as string) || 'auto',
      analysisType: (existingOptions.analysisType as string) || 'impact',
      install: (existingOptions.install as boolean) ?? true,
      changelog: (existingOptions.changelog as boolean) ?? false,
    }
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
  async collectWorkspaceOptions(existingOptions: Record<string, unknown> = {}): Promise<{
    validate: boolean
    stats: boolean
    format: string
  }> {
    return {
      validate: (existingOptions.validate as boolean) ?? false,
      stats: (existingOptions.stats as boolean) ?? true,
      format: (existingOptions.format as string) || 'table',
    }
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
  async collectSecurityOptions(existingOptions: Record<string, unknown> = {}): Promise<{
    format: string
    audit: boolean
    fixVulns: boolean
    severity?: string
    includeDev: boolean
    snyk: boolean
  }> {
    return {
      format: (existingOptions.format as string) || 'table',
      audit: (existingOptions.audit as boolean) ?? true,
      fixVulns: (existingOptions.fixVulns as boolean) ?? false,
      severity: (existingOptions.severity as string) || undefined,
      includeDev: (existingOptions.includeDev as boolean) ?? false,
      snyk: (existingOptions.snyk as boolean) ?? false,
    }
  }

  /**
   * Init command - no interaction needed, use quick mode
   */
  async collectInitOptions(existingOptions: Record<string, unknown> = {}): Promise<{
    force: boolean
    full: boolean
    createWorkspace: boolean
  }> {
    return {
      force: (existingOptions.force as boolean) ?? false,
      full: (existingOptions.full as boolean) ?? false,
      createWorkspace: (existingOptions.createWorkspace as boolean) ?? true,
    }
  }

  /**
   * Cache command - no interaction needed, defaults to stats
   */
  async collectCacheOptions(existingOptions: Record<string, unknown> = {}): Promise<{
    stats: boolean
    clear: boolean
  }> {
    return {
      stats: (existingOptions.stats as boolean) ?? true,
      clear: (existingOptions.clear as boolean) ?? false,
    }
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
  async collectWatchOptions(existingOptions: Record<string, unknown> = {}): Promise<{
    catalog?: string
    format: string
    target: string
    prerelease: boolean
    include: string[]
    exclude: string[]
    debounce: number
    clear: boolean
  }> {
    return {
      catalog: (existingOptions.catalog as string) || undefined,
      format: (existingOptions.format as string) || 'table',
      target: (existingOptions.target as string) || 'latest',
      prerelease: (existingOptions.prerelease as boolean) ?? false,
      include: (existingOptions.include as string[]) || [],
      exclude: (existingOptions.exclude as string[]) || [],
      debounce: (existingOptions.debounce as number) ?? 300,
      clear: (existingOptions.clear as boolean) ?? false,
    }
  }
}

/**
 * Singleton instance for convenience
 */
export const interactiveOptionsCollector = new InteractiveOptionsCollector()
