/**
 * Configuration Loader
 *
 * Loads and merges user configuration with default configuration.
 * Supports multiple configuration file formats and locations.
 *
 * SECURITY NOTE:
 * By default, only JSON config files are loaded for security reasons.
 * Dynamic config files (JS/TS) can execute arbitrary code during import.
 * To enable JS/TS config loading, set the environment variable:
 *   PCU_ALLOW_DYNAMIC_CONFIG=true
 *
 * DEPENDENCY INJECTION:
 * For testability, services should accept IConfigLoader interface in constructor.
 * Use the exported `configLoader` singleton or provide a mock implementation.
 */

import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ConfigurationError } from '../error-handling/index.js'
import { logger } from '../logger/logger.js'
import { validatePackageFilterConfig } from '../utils/validation.js'
import {
  CONFIG_FILE_NAMES,
  DEFAULT_PACKAGE_FILTER_CONFIG,
  type DefaultPackageFilterConfig,
  type PackageFilterConfig,
} from './packageFilterConfig.js'

/**
 * Configuration loader interface for dependency injection.
 * Allows services to accept a config loader that can be mocked in tests.
 */
export interface IConfigLoader {
  /**
   * Load configuration from the specified directory (async)
   */
  loadConfig(workspacePath?: string): Promise<PackageFilterConfig>

  /**
   * Load configuration synchronously (JSON only)
   */
  loadConfigSync(workspacePath?: string): PackageFilterConfig

  /**
   * Clear configuration cache
   */
  clearCache(): void

  /**
   * Get effective configuration for a specific package
   */
  getPackageConfig(
    packageName: string,
    config: PackageFilterConfig
  ): {
    shouldUpdate: boolean
    target: string
    requireConfirmation: boolean
    autoUpdate: boolean
    groupUpdate: boolean
  }
}

/**
 * Environment variable to explicitly allow dynamic (JS/TS) config loading.
 * This is a security measure to prevent arbitrary code execution from config files.
 */
const ALLOW_DYNAMIC_CONFIG_ENV = 'PCU_ALLOW_DYNAMIC_CONFIG'

/**
 * SEC-001: Cache environment variable at module load time to prevent runtime bypass.
 * This ensures the security decision is made once at startup and cannot be
 * modified by malicious code at runtime through process.env manipulation.
 *
 * The value is frozen at module initialization time.
 */
const DYNAMIC_CONFIG_ALLOWED_AT_STARTUP: boolean = (() => {
  const envValue = process.env[ALLOW_DYNAMIC_CONFIG_ENV]
  if (!envValue) {
    return false
  }
  // SEC-001: Case-insensitive comparison for common truthy values
  const normalizedValue = envValue.toLowerCase().trim()
  const isAllowed =
    normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes'

  // SEC-001: Audit log when dynamic config is enabled
  if (isAllowed) {
    // Use console.warn for security-related startup messages to ensure visibility
    // even if logger hasn't been fully initialized yet
    console.warn(
      `[PCU Security] Dynamic config loading enabled via ${ALLOW_DYNAMIC_CONFIG_ENV}=${envValue}. ` +
        `JS/TS config files can execute arbitrary code.`
    )
  }

  return isAllowed
})()

/**
 * Check if dynamic config loading is explicitly allowed.
 *
 * SEC-001: This function returns a cached value that was determined at module
 * load time. This prevents runtime manipulation of process.env from bypassing
 * the security check.
 */
function isDynamicConfigAllowed(): boolean {
  return DYNAMIC_CONFIG_ALLOWED_AT_STARTUP
}

/**
 * Check if a config file is a dynamic (JS/TS) config
 */
function isDynamicConfig(fileName: string): boolean {
  return fileName.endsWith('.js') || fileName.endsWith('.ts')
}

/**
 * Configuration loader implementation.
 *
 * Usage:
 * - For dependency injection (recommended): Use the exported `configLoader` singleton
 * - For backward compatibility: Use static methods like `ConfigLoader.loadConfig()`
 *
 * Example with DI:
 * ```ts
 * class MyService {
 *   constructor(private readonly config: IConfigLoader = configLoader) {}
 *   async doSomething() {
 *     const cfg = await this.config.loadConfig();
 *   }
 * }
 * ```
 */
export class ConfigLoader implements IConfigLoader {
  private cache = new Map<string, PackageFilterConfig>()

  // Static cache for backward compatibility with static methods
  private static staticInstance: ConfigLoader | null = null

  // PERF-005: Static regex cache to avoid recompiling patterns on every match
  private static regexCache = new Map<string, RegExp>()

  private static getInstance(): ConfigLoader {
    if (!ConfigLoader.staticInstance) {
      ConfigLoader.staticInstance = new ConfigLoader()
    }
    return ConfigLoader.staticInstance
  }

  // ============================================================
  // Public instance methods with static backward-compatibility versions
  // ============================================================

  /**
   * Load configuration from the specified directory (async)
   * Supports JSON, JavaScript (.js), and TypeScript (.ts) config files.
   */
  async loadConfig(workspacePath: string = process.cwd()): Promise<PackageFilterConfig> {
    const cacheKey = workspacePath
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    const userConfig = await this.findAndLoadUserConfig(workspacePath)
    const mergedConfig = ConfigLoader.mergeConfigs(DEFAULT_PACKAGE_FILTER_CONFIG, userConfig || {})

    this.cache.set(cacheKey, mergedConfig)
    return mergedConfig
  }

  /**
   * Load configuration from the specified directory (async)
   * @deprecated Use configLoader.loadConfig() for better testability
   */
  static async loadConfig(workspacePath: string = process.cwd()): Promise<PackageFilterConfig> {
    return ConfigLoader.getInstance().loadConfig(workspacePath)
  }

  /**
   * Load configuration synchronously (JSON only)
   * For backward compatibility with code that can't use async.
   */
  loadConfigSync(workspacePath: string = process.cwd()): PackageFilterConfig {
    const cacheKey = workspacePath
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    const userConfig = this.findAndLoadUserConfigSync(workspacePath)
    const mergedConfig = ConfigLoader.mergeConfigs(DEFAULT_PACKAGE_FILTER_CONFIG, userConfig || {})

    this.cache.set(cacheKey, mergedConfig)
    return mergedConfig
  }

  /**
   * Load configuration synchronously (JSON only)
   * @deprecated Use configLoader.loadConfigSync() for better testability
   */
  static loadConfigSync(workspacePath: string = process.cwd()): PackageFilterConfig {
    return ConfigLoader.getInstance().loadConfigSync(workspacePath)
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Clear configuration cache
   * @deprecated Use configLoader.clearCache() for better testability
   */
  static clearCache(): void {
    ConfigLoader.getInstance().clearCache()
    ConfigLoader.staticInstance = null
  }

  /**
   * Get effective configuration for a specific package (instance method)
   */
  getPackageConfig(
    packageName: string,
    config: PackageFilterConfig
  ): {
    shouldUpdate: boolean
    target: string
    requireConfirmation: boolean
    autoUpdate: boolean
    groupUpdate: boolean
  } {
    return ConfigLoader.getPackageConfig(packageName, config)
  }

  // ============================================================
  // Private instance methods
  // ============================================================

  /**
   * Find and load user configuration file (async)
   *
   * SECURITY: Dynamic configs (JS/TS) are only loaded if PCU_ALLOW_DYNAMIC_CONFIG=true
   */
  private async findAndLoadUserConfig(workspacePath: string): Promise<PackageFilterConfig | null> {
    const dynamicAllowed = isDynamicConfigAllowed()
    let skippedDynamicConfig: string | null = null

    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = join(workspacePath, fileName)
      if (existsSync(configPath)) {
        // Security check: skip dynamic configs unless explicitly allowed
        if (isDynamicConfig(fileName)) {
          if (!dynamicAllowed) {
            skippedDynamicConfig = configPath
            continue
          }
        }

        try {
          return await ConfigLoader.loadConfigFile(configPath)
        } catch (error) {
          // QUAL-002: Don't swallow configuration errors - user needs to know their config is broken
          if (error instanceof ConfigurationError) {
            throw error
          }
          // JSON syntax errors should also be thrown so users know their config is malformed
          if (error instanceof SyntaxError) {
            throw new ConfigurationError(configPath, `Invalid JSON syntax: ${error.message}`)
          }
          // Other errors (permissions, etc.) can be logged and skipped
          logger.warn(
            `Failed to load config file ${configPath}`,
            error instanceof Error ? error : undefined
          )
        }
      }
    }

    // Warn user if a dynamic config was skipped
    if (skippedDynamicConfig) {
      logger.warn(
        `Security Warning: Skipped dynamic config file: ${skippedDynamicConfig}. ` +
          `Dynamic configs (JS/TS) can execute arbitrary code during import. ` +
          `To enable, set environment variable: ${ALLOW_DYNAMIC_CONFIG_ENV}=true. ` +
          `Or use a JSON config file instead (.pcurc.json)`
      )
    }

    return null
  }

  /**
   * Find and load user configuration file (sync, JSON only)
   */
  private findAndLoadUserConfigSync(workspacePath: string): PackageFilterConfig | null {
    for (const fileName of CONFIG_FILE_NAMES) {
      // Skip JS/TS files in sync mode
      if (fileName.endsWith('.js') || fileName.endsWith('.ts')) {
        continue
      }
      const configPath = join(workspacePath, fileName)
      if (existsSync(configPath)) {
        try {
          return ConfigLoader.loadConfigFileSync(configPath)
        } catch (error) {
          // QUAL-002: Don't swallow configuration errors - user needs to know their config is broken
          if (error instanceof ConfigurationError) {
            throw error
          }
          // JSON syntax errors should also be thrown so users know their config is malformed
          if (error instanceof SyntaxError) {
            throw new ConfigurationError(configPath, `Invalid JSON syntax: ${error.message}`)
          }
          // Other errors (permissions, etc.) can be logged and skipped
          logger.warn(
            `Failed to load config file ${configPath}`,
            error instanceof Error ? error : undefined
          )
        }
      }
    }
    return null
  }

  // ============================================================
  // Private static helper methods (pure functions, no state)
  // ============================================================

  /**
   * Load configuration from a specific file (async)
   * Supports JSON, JavaScript (.js), and TypeScript (.ts) files.
   *
   * SECURITY: Dynamic configs require PCU_ALLOW_DYNAMIC_CONFIG=true
   */
  private static async loadConfigFile(configPath: string): Promise<PackageFilterConfig> {
    if (configPath.endsWith('.json')) {
      // PERF-002: Use async readFile for async method instead of sync readFileSync
      const content = await readFile(configPath, 'utf-8')
      const parsed: unknown = JSON.parse(content)
      // QUAL-015: Validate config structure at runtime instead of unsafe type assertion
      const validation = validatePackageFilterConfig(parsed)
      if (!validation.isValid) {
        throw new ConfigurationError(
          configPath,
          `Invalid configuration: ${validation.errors.join('; ')}`
        )
      }
      // Log warnings for non-critical issues
      if (validation.warnings.length > 0) {
        logger.warn(`Configuration warnings in ${configPath}: ${validation.warnings.join('; ')}`)
      }
      return parsed as PackageFilterConfig
    }

    if (configPath.endsWith('.js') || configPath.endsWith('.ts')) {
      // Double-check security constraint
      if (!isDynamicConfigAllowed()) {
        throw new ConfigurationError(
          configPath,
          `Dynamic config files (JS/TS) are disabled for security. ` +
            `Set ${ALLOW_DYNAMIC_CONFIG_ENV}=true to enable, or use a JSON config file.`
        )
      }
      return ConfigLoader.loadDynamicConfig(configPath)
    }

    throw new ConfigurationError(configPath, 'unsupported config file format')
  }

  /**
   * Load configuration from a specific file (sync, JSON only)
   */
  private static loadConfigFileSync(configPath: string): PackageFilterConfig {
    if (configPath.endsWith('.json')) {
      const content = readFileSync(configPath, 'utf-8')
      const parsed: unknown = JSON.parse(content)
      // QUAL-015: Validate config structure at runtime instead of unsafe type assertion
      const validation = validatePackageFilterConfig(parsed)
      if (!validation.isValid) {
        throw new ConfigurationError(
          configPath,
          `Invalid configuration: ${validation.errors.join('; ')}`
        )
      }
      // Log warnings for non-critical issues
      if (validation.warnings.length > 0) {
        logger.warn(`Configuration warnings in ${configPath}: ${validation.warnings.join('; ')}`)
      }
      return parsed as PackageFilterConfig
    }

    throw new ConfigurationError(
      configPath,
      'Only JSON config files are supported in sync mode. Use loadConfig() for JS/TS files.'
    )
  }

  /**
   * Dynamically import a JavaScript or TypeScript config file
   */
  private static async loadDynamicConfig(configPath: string): Promise<PackageFilterConfig> {
    try {
      // Convert to file URL for cross-platform compatibility
      const fileUrl = pathToFileURL(configPath).href

      // Dynamic import - works for .js files and .ts files if running with tsx/ts-node
      const module = await import(fileUrl)

      // Support both default export and named 'config' export
      const config = module.default ?? module.config ?? module

      if (!config || typeof config !== 'object') {
        throw new ConfigurationError(
          configPath,
          'Config file must export a configuration object as default export or named "config" export'
        )
      }

      // QUAL-015: Validate config structure at runtime instead of unsafe type assertion
      const validation = validatePackageFilterConfig(config)
      if (!validation.isValid) {
        throw new ConfigurationError(
          configPath,
          `Invalid configuration: ${validation.errors.join('; ')}`
        )
      }
      // Log warnings for non-critical issues
      if (validation.warnings.length > 0) {
        logger.warn(`Configuration warnings in ${configPath}: ${validation.warnings.join('; ')}`)
      }
      return config as PackageFilterConfig
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error
      }

      // Provide helpful error message for TypeScript files
      if (configPath.endsWith('.ts')) {
        throw new ConfigurationError(
          configPath,
          `Failed to load TypeScript config. Make sure you're running with a TypeScript loader (tsx, ts-node) or use a .json config instead. Original error: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      throw new ConfigurationError(
        configPath,
        `Failed to load config file: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Deep merge two configuration objects
   */
  private static mergeConfigs(
    defaultConfig: DefaultPackageFilterConfig,
    userConfig: PackageFilterConfig
  ): PackageFilterConfig {
    const merged: PackageFilterConfig = JSON.parse(JSON.stringify(defaultConfig))

    // Locale - user config overrides (no default)
    if (userConfig.locale) {
      merged.locale = userConfig.locale
    }

    // Merge simple arrays and objects
    if (userConfig.exclude) {
      merged.exclude = [...(merged.exclude || []), ...userConfig.exclude]
    }

    if (userConfig.include) {
      merged.include = [...(merged.include || []), ...userConfig.include]
    }

    if (userConfig.defaults) {
      merged.defaults = { ...merged.defaults, ...userConfig.defaults }
    }

    if (userConfig.security) {
      merged.security = { ...merged.security, ...userConfig.security }
    }

    if (userConfig.advanced) {
      merged.advanced = { ...merged.advanced, ...userConfig.advanced }
    }

    if (userConfig.monorepo) {
      merged.monorepo = { ...merged.monorepo, ...userConfig.monorepo }

      // For arrays in monorepo config, replace rather than merge
      if (userConfig.monorepo.syncVersions) {
        merged.monorepo!.syncVersions = userConfig.monorepo.syncVersions
      }
      if (userConfig.monorepo.catalogPriority) {
        merged.monorepo!.catalogPriority = userConfig.monorepo.catalogPriority
      }
    }

    // Package rules need special handling - user rules override default rules with same patterns
    if (userConfig.packageRules) {
      const defaultRules = merged.packageRules || []
      const userRules = userConfig.packageRules

      // Start with default rules, but remove any that would be overridden by user rules
      const filteredDefaultRules = defaultRules.filter(
        (defaultRule) =>
          !userRules.some((userRule) =>
            // Check if any user rule pattern overlaps with this default rule
            userRule.patterns.some((userPattern) =>
              defaultRule.patterns.some(
                (defaultPattern) =>
                  userPattern === defaultPattern ||
                  (userPattern.includes('*') &&
                    ConfigLoader.patternsOverlap(userPattern, defaultPattern)) ||
                  (defaultPattern.includes('*') &&
                    ConfigLoader.patternsOverlap(defaultPattern, userPattern))
              )
            )
          )
      )

      // Combine filtered default rules with user rules (user rules take priority)
      merged.packageRules = [...filteredDefaultRules, ...userRules]
    }

    return merged
  }

  /**
   * Get effective configuration for a specific package
   */
  static getPackageConfig(
    packageName: string,
    config: PackageFilterConfig
  ): {
    shouldUpdate: boolean
    target: string
    requireConfirmation: boolean
    autoUpdate: boolean
    groupUpdate: boolean
  } {
    // Check if package is explicitly excluded
    if (config.exclude?.some((pattern) => ConfigLoader.matchesPattern(packageName, pattern))) {
      return {
        shouldUpdate: false,
        target: config.defaults?.target || 'latest',
        requireConfirmation: false,
        autoUpdate: false,
        groupUpdate: false,
      }
    }

    // Check if package is explicitly included (if include list exists)
    if (config.include && config.include.length > 0) {
      const isIncluded = config.include.some((pattern) =>
        ConfigLoader.matchesPattern(packageName, pattern)
      )
      if (!isIncluded) {
        return {
          shouldUpdate: false,
          target: config.defaults?.target || 'latest',
          requireConfirmation: false,
          autoUpdate: false,
          groupUpdate: false,
        }
      }
    }

    // First check if package is in relatedPackages of any rule (higher priority)
    let matchingRule = config.packageRules?.find((rule) =>
      rule.relatedPackages?.some((relatedPattern) =>
        ConfigLoader.matchesPattern(packageName, relatedPattern)
      )
    )

    // If no relatedPackages match, find direct pattern match
    if (!matchingRule) {
      matchingRule = config.packageRules?.find((rule) =>
        rule.patterns.some((pattern) => ConfigLoader.matchesPattern(packageName, pattern))
      )
    }

    if (matchingRule) {
      return {
        shouldUpdate: true,
        target: matchingRule.target || config.defaults?.target || 'latest',
        requireConfirmation: matchingRule.requireConfirmation || false,
        autoUpdate: matchingRule.autoUpdate || false,
        groupUpdate: matchingRule.groupUpdate || false,
      }
    }

    // Use default configuration
    return {
      shouldUpdate: true,
      target: config.defaults?.target || 'latest',
      requireConfirmation: false,
      autoUpdate: false,
      groupUpdate: false,
    }
  }

  /**
   * Simple glob pattern matching
   *
   * Supports:
   * - `*` matches any sequence of characters (except path separators)
   * - `?` matches any single character
   *
   * Examples:
   * - `@types/*` matches `@types/node`, `@types/react`
   * - `eslint*` matches `eslint`, `eslint-plugin-react`
   */
  private static matchesPattern(packageName: string, pattern: string): boolean {
    // PERF-005: Use cached regex to avoid recompilation on every call
    let regex = ConfigLoader.regexCache.get(pattern)
    if (!regex) {
      // Escape regex metacharacters first, preserving * and ? for glob conversion
      const escapedPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
        .replace(/\*/g, '.*') // Convert glob * to regex .*
        .replace(/\?/g, '.') // Convert glob ? to regex .
      regex = new RegExp(`^${escapedPattern}$`, 'i')
      ConfigLoader.regexCache.set(pattern, regex)
    }
    return regex.test(packageName)
  }

  /**
   * Check if two patterns overlap (one could match packages that the other matches)
   */
  private static patternsOverlap(pattern1: string, pattern2: string): boolean {
    // Simple implementation: check if either pattern would match the other as a package name
    return (
      ConfigLoader.matchesPattern(pattern1.replace(/\*/g, 'x'), pattern2) ||
      ConfigLoader.matchesPattern(pattern2.replace(/\*/g, 'x'), pattern1)
    )
  }
}

/**
 * Default ConfigLoader singleton instance.
 * Use this for dependency injection in services.
 *
 * Example:
 * ```ts
 * class MyService {
 *   constructor(private readonly config: IConfigLoader = configLoader) {}
 * }
 * ```
 */
export const configLoader: IConfigLoader = new ConfigLoader()
