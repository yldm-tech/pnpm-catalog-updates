/**
 * NPM/PNPM Configuration Parser
 *
 * Reads and parses .npmrc and .pnpmrc configuration files to extract registry settings
 * for different package scopes. Supports both npm and pnpm configuration formats.
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@pcu/utils'

export interface NpmrcConfig {
  // Default registry
  registry: string
  // Scoped registries (e.g., @mycompany -> https://npm.mycompany.com)
  scopedRegistries: Map<string, string>
  // Auth tokens for registries (SECURITY: Do not log this directly)
  authTokens: Map<string, string>
  // Other npm config values
  config: Map<string, string>
}

/**
 * Safe representation of NpmrcConfig for logging
 * Redacts sensitive authentication tokens to prevent credential leakage
 */
export interface SafeNpmrcConfig {
  registry: string
  scopedRegistries: Record<string, string>
  authTokensCount: number
  hasAuthTokens: boolean
  configKeys: string[]
}

/**
 * Convert NpmrcConfig to a safe loggable representation
 * This function redacts auth tokens while preserving debugging utility
 */
export function toSafeConfig(config: NpmrcConfig): SafeNpmrcConfig {
  return {
    registry: config.registry,
    scopedRegistries: Object.fromEntries(config.scopedRegistries),
    authTokensCount: config.authTokens.size,
    hasAuthTokens: config.authTokens.size > 0,
    configKeys: Array.from(config.config.keys()),
  }
}

/**
 * Check if a config has auth token for a specific registry without exposing the token
 */
export function hasAuthTokenForRegistry(config: NpmrcConfig, registryHost: string): boolean {
  return config.authTokens.has(registryHost)
}

/**
 * SEC-007: Validation result for npm auth tokens
 */
export interface TokenValidationResult {
  isValid: boolean
  format: 'npm_token' | 'legacy_uuid' | 'unknown'
  warnings: string[]
}

/**
 * SEC-007: Validate npm auth token format
 *
 * Supports:
 * - New npm tokens: `npm_` prefix followed by base64-like characters
 * - Legacy tokens: UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 *
 * @param token - The auth token to validate
 * @returns Validation result with format detection and warnings
 */
export function validateAuthToken(token: string): TokenValidationResult {
  const warnings: string[] = []

  // Check for empty or whitespace-only tokens
  if (!token || token.trim().length === 0) {
    return { isValid: false, format: 'unknown', warnings: ['Token is empty or whitespace-only'] }
  }

  const trimmedToken = token.trim()

  // Check for obvious placeholder tokens
  const placeholderPatterns = [
    /^your[-_]?token/i,
    /^todo/i,
    /^replace[-_]?me/i,
    /^xxx+$/i,
    /^placeholder/i,
    /^insert[-_]?token/i,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(trimmedToken)) {
      warnings.push('Token appears to be a placeholder value')
      return { isValid: false, format: 'unknown', warnings }
    }
  }

  // New npm token format: npm_ prefix
  // Format: npm_[A-Za-z0-9]{36,} (at least 36 chars after prefix)
  if (trimmedToken.startsWith('npm_')) {
    const tokenBody = trimmedToken.slice(4)
    if (/^[A-Za-z0-9]{36,}$/.test(tokenBody)) {
      return { isValid: true, format: 'npm_token', warnings: [] }
    }
    warnings.push('Token has npm_ prefix but invalid format')
    return { isValid: false, format: 'npm_token', warnings }
  }

  // Legacy UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidPattern.test(trimmedToken)) {
    return { isValid: true, format: 'legacy_uuid', warnings: [] }
  }

  // Check for minimum length (tokens should be reasonably long)
  if (trimmedToken.length < 20) {
    warnings.push('Token is suspiciously short (less than 20 characters)')
    return { isValid: false, format: 'unknown', warnings }
  }

  // Accept other formats but mark as unknown (for private registry tokens)
  // This allows custom enterprise registry tokens to work
  return { isValid: true, format: 'unknown', warnings: [] }
}

export class NpmrcParser {
  private static readonly DEFAULT_REGISTRY = 'https://registry.npmjs.org/'

  /**
   * Parse .npmrc/.pnpmrc configuration from multiple sources (async version)
   */
  static async parse(
    workingDirectory: string = process.cwd(),
    includeGlobal: boolean = true
  ): Promise<NpmrcConfig> {
    const config: NpmrcConfig = {
      registry: NpmrcParser.DEFAULT_REGISTRY,
      scopedRegistries: new Map(),
      authTokens: new Map(),
      config: new Map(),
    }

    // Load config files in order of precedence (later files override earlier)
    // Priority: project .pnpmrc > project .npmrc > global .pnpmrc > global .npmrc
    const configPaths: string[] = []

    // Only include global configs if requested (for production use)
    if (includeGlobal) {
      configPaths.push(join(homedir(), '.npmrc')) // Global npmrc (lowest priority)
      configPaths.push(join(homedir(), '.pnpmrc')) // Global pnpmrc
    }

    configPaths.push(join(workingDirectory, '.npmrc')) // Project npmrc
    configPaths.push(join(workingDirectory, '.pnpmrc')) // Project pnpmrc (highest priority)

    // Parse config files sequentially to ensure correct priority order
    // (later files override earlier ones)
    for (const configPath of configPaths) {
      await NpmrcParser.parseFile(configPath, config)
    }

    // Also check for environment variables (skip in tests if includeGlobal is false)
    NpmrcParser.parseEnvironment(config, includeGlobal)

    return config
  }

  /**
   * Parse a single .npmrc file (async version)
   */
  private static async parseFile(filepath: string, config: NpmrcConfig): Promise<void> {
    try {
      const content = await readFile(filepath, 'utf-8')
      NpmrcParser.parseContent(content, config)
    } catch (error) {
      // File doesn't exist or is unreadable - silently ignore
      // This is expected behavior for optional config files
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.debug(`Failed to parse npmrc file ${filepath}`, { error })
      }
    }
  }

  /**
   * Parse npmrc content string into config object
   */
  private static parseContent(content: string, config: NpmrcConfig): void {
    const lines = content.split('\n')

    for (const line of lines) {
      const trimmedLine = line.trim()

      // Skip comments and empty lines
      if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith(';')) {
        continue
      }

      // Parse key=value pairs
      const separatorIndex = trimmedLine.indexOf('=')
      if (separatorIndex === -1) continue

      const key = trimmedLine.substring(0, separatorIndex).trim()
      const value = trimmedLine.substring(separatorIndex + 1).trim()

      // Handle scoped registries (e.g., @mycompany:registry=https://npm.mycompany.com/)
      if (key.includes(':registry')) {
        const scope = key.replace(':registry', '')
        config.scopedRegistries.set(scope, NpmrcParser.normalizeRegistryUrl(value))
      }
      // Handle default registry
      else if (key === 'registry') {
        config.registry = NpmrcParser.normalizeRegistryUrl(value)
      }
      // Handle auth tokens (e.g., //registry.npmjs.org/:_authToken=...)
      else if (key.includes(':_authToken') || key.includes('_authToken')) {
        // Extract registry URL from the key
        const match = key.match(/\/\/(.*?)\/:/)
        if (match?.[1]) {
          const registryHost = match[1]

          // SEC-007: Validate token format before storing
          const validation = validateAuthToken(value)
          if (!validation.isValid) {
            logger.warn(`Invalid auth token for ${registryHost}`, {
              format: validation.format,
              warnings: validation.warnings,
            })
          }

          // Store token regardless of validation (to avoid breaking existing workflows)
          config.authTokens.set(registryHost, value)
        }
      }
      // Store other config values
      else {
        config.config.set(key, value)
      }
    }
  }

  /**
   * Parse npm configuration from environment variables
   */
  private static parseEnvironment(config: NpmrcConfig, includeEnv: boolean = true): void {
    if (!includeEnv) {
      return // Skip environment parsing in tests
    }

    // Check for npm_config_registry
    if (process.env.npm_config_registry) {
      config.registry = NpmrcParser.normalizeRegistryUrl(process.env.npm_config_registry)
    }

    // Check for scoped registries in environment
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('npm_config_') && key.includes('_registry')) {
        // Extract scope from environment variable name
        // e.g., npm_config_@mycompany_registry -> @mycompany
        const match = key.match(/npm_config_(.+)_registry/)
        if (match?.[1] && value) {
          const scope = match[1].replace(/_/g, '/').replace(/\//, '@')
          config.scopedRegistries.set(scope, NpmrcParser.normalizeRegistryUrl(value))
        }
      }
    }
  }

  /**
   * Get the appropriate registry URL for a package
   */
  static getRegistryForPackage(packageName: string, config: NpmrcConfig): string {
    // Check if package has a scope (e.g., @mycompany/package)
    if (packageName.startsWith('@')) {
      const scopeEnd = packageName.indexOf('/')
      if (scopeEnd !== -1) {
        const scope = packageName.substring(0, scopeEnd)

        // Check if we have a scoped registry for this scope
        const scopedRegistry = config.scopedRegistries.get(scope)
        if (scopedRegistry) {
          return scopedRegistry
        }
      }
    }

    // Fall back to default registry
    return config.registry
  }

  /**
   * Normalize registry URL to ensure it has a trailing slash
   */
  private static normalizeRegistryUrl(url: string): string {
    // Remove any quotes that might be in the config
    url = url.replace(/^["']|["']$/g, '')

    // Ensure trailing slash
    if (!url.endsWith('/')) {
      url += '/'
    }

    return url
  }

  /**
   * Get auth token for a registry
   */
  static getAuthToken(registryUrl: string, config: NpmrcConfig): string | undefined {
    try {
      const url = new URL(registryUrl)
      return config.authTokens.get(url.hostname)
    } catch {
      return undefined
    }
  }
}
