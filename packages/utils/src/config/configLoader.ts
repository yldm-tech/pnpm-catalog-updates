/**
 * Configuration Loader
 *
 * Loads and merges user configuration with default configuration.
 * Supports multiple configuration file formats and locations.
 * Supports JSON, JavaScript (.js), and TypeScript (.ts) config files.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ConfigurationError } from '../error-handling/index.js'
import {
  CONFIG_FILE_NAMES,
  DEFAULT_PACKAGE_FILTER_CONFIG,
  type DefaultPackageFilterConfig,
  type PackageFilterConfig,
} from './packageFilterConfig.js'

export class ConfigLoader {
  private static cache = new Map<string, PackageFilterConfig>()

  /**
   * Load configuration from the specified directory (async)
   * Supports JSON, JavaScript (.js), and TypeScript (.ts) config files.
   */
  static async loadConfig(workspacePath: string = process.cwd()): Promise<PackageFilterConfig> {
    const cacheKey = workspacePath
    if (ConfigLoader.cache.has(cacheKey)) {
      return ConfigLoader.cache.get(cacheKey)!
    }

    const userConfig = await ConfigLoader.findAndLoadUserConfig(workspacePath)
    const mergedConfig = ConfigLoader.mergeConfigs(DEFAULT_PACKAGE_FILTER_CONFIG, userConfig || {})

    ConfigLoader.cache.set(cacheKey, mergedConfig)
    return mergedConfig
  }

  /**
   * Load configuration synchronously (JSON only)
   * For backward compatibility with code that can't use async.
   */
  static loadConfigSync(workspacePath: string = process.cwd()): PackageFilterConfig {
    const cacheKey = workspacePath
    if (ConfigLoader.cache.has(cacheKey)) {
      return ConfigLoader.cache.get(cacheKey)!
    }

    const userConfig = ConfigLoader.findAndLoadUserConfigSync(workspacePath)
    const mergedConfig = ConfigLoader.mergeConfigs(DEFAULT_PACKAGE_FILTER_CONFIG, userConfig || {})

    ConfigLoader.cache.set(cacheKey, mergedConfig)
    return mergedConfig
  }

  /**
   * Clear configuration cache
   */
  static clearCache(): void {
    ConfigLoader.cache.clear()
  }

  /**
   * Find and load user configuration file (async)
   */
  private static async findAndLoadUserConfig(
    workspacePath: string
  ): Promise<PackageFilterConfig | null> {
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = join(workspacePath, fileName)
      if (existsSync(configPath)) {
        try {
          return await ConfigLoader.loadConfigFile(configPath)
        } catch (error) {
          console.warn(`Warning: Failed to load config file ${configPath}:`, error)
        }
      }
    }
    return null
  }

  /**
   * Find and load user configuration file (sync, JSON only)
   */
  private static findAndLoadUserConfigSync(workspacePath: string): PackageFilterConfig | null {
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
          console.warn(`Warning: Failed to load config file ${configPath}:`, error)
        }
      }
    }
    return null
  }

  /**
   * Load configuration from a specific file (async)
   * Supports JSON, JavaScript (.js), and TypeScript (.ts) files.
   */
  private static async loadConfigFile(configPath: string): Promise<PackageFilterConfig> {
    if (configPath.endsWith('.json')) {
      const content = readFileSync(configPath, 'utf-8')
      return JSON.parse(content) as PackageFilterConfig
    }

    if (configPath.endsWith('.js') || configPath.endsWith('.ts')) {
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
      return JSON.parse(content) as PackageFilterConfig
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
   */
  private static matchesPattern(packageName: string, pattern: string): boolean {
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
    const regex = new RegExp(`^${regexPattern}$`, 'i')
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
