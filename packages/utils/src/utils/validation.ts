/**
 * Validation Utilities
 */

import { parse as parseYaml } from 'yaml'

// PERF-003: Pre-built Sets for O(1) validation lookups instead of Array.includes() O(n)
const VALID_LOG_LEVELS = new Set(['error', 'warn', 'info', 'debug'])
const VALID_UPDATE_TARGETS = new Set(['latest', 'greatest', 'minor', 'patch', 'newest'])
const VALID_OUTPUT_FORMATS = new Set(['table', 'json', 'yaml', 'minimal'])

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * QUAL-003: Unified ValidationResult class
 * Single implementation for all domain validation results
 */
export class ValidationResultClass implements ValidationResult {
  public readonly isValid: boolean
  public readonly errors: string[]
  public readonly warnings: string[]

  constructor(isValid: boolean, errors: string[] = [], warnings: string[] = []) {
    this.isValid = isValid
    this.errors = [...errors]
    this.warnings = [...warnings]
  }

  public getIsValid(): boolean {
    return this.isValid
  }

  public getErrors(): string[] {
    return [...this.errors]
  }

  public getWarnings(): string[] {
    return [...this.warnings]
  }

  public hasErrors(): boolean {
    return this.errors.length > 0
  }

  public hasWarnings(): boolean {
    return this.warnings.length > 0
  }

  /**
   * Merge multiple validation results into one
   */
  public static merge(...results: ValidationResult[]): ValidationResultClass {
    const allErrors: string[] = []
    const allWarnings: string[] = []

    for (const result of results) {
      allErrors.push(...result.errors)
      allWarnings.push(...result.warnings)
    }

    return new ValidationResultClass(allErrors.length === 0, allErrors, allWarnings)
  }

  /**
   * Create a valid result with no errors
   */
  public static valid(warnings: string[] = []): ValidationResultClass {
    return new ValidationResultClass(true, [], warnings)
  }

  /**
   * Create an invalid result with errors
   */
  public static invalid(errors: string[], warnings: string[] = []): ValidationResultClass {
    return new ValidationResultClass(false, errors, warnings)
  }
}

/**
 * Create validation result
 */
export function createValidationResult(
  isValid: boolean = true,
  errors: string[] = [],
  warnings: string[] = []
): ValidationResult {
  return { isValid, errors, warnings }
}

/**
 * Validate email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Validate semver version
 */
export function isValidSemver(version: string): boolean {
  const semverRegex =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
  return semverRegex.test(version)
}

/**
 * Validate package name
 */
export function isValidPackageName(name: string): boolean {
  // NPM package name rules
  const packageNameRegex = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
  return packageNameRegex.test(name) && name.length <= 214
}

/**
 * Validate file path
 */
export function isValidPath(path: string): boolean {
  // Basic path validation (no null bytes, etc.)
  return !path.includes('\0') && path.length > 0 && path.length < 4096
}

/**
 * Validate JSON string
 */
export function isValidJson(jsonString: string): boolean {
  try {
    JSON.parse(jsonString)
    return true
  } catch {
    return false
  }
}

/**
 * Validate YAML string using actual YAML parser
 * QUAL-017: Replaced naive string-based validation with proper YAML parsing
 */
export function isValidYaml(yamlString: string): boolean {
  try {
    // Empty string is valid YAML (represents null/empty document)
    if (yamlString.trim() === '') {
      return true
    }

    // Use actual YAML parser for proper validation
    // This catches all syntax errors including:
    // - Invalid indentation
    // - Malformed key-value pairs
    // - Invalid characters
    // - Unclosed quotes
    // - Invalid escape sequences
    parseYaml(yamlString, { strict: true })
    return true
  } catch {
    return false
  }
}

/**
 * Validate glob pattern
 */
export function isValidGlob(pattern: string): boolean {
  try {
    // Basic glob pattern validation
    if (pattern.includes('**/**/**')) {
      return false // Too many recursive wildcards
    }

    if (pattern.includes('//')) {
      return false // Double slashes
    }

    // Check for balanced brackets
    let bracketDepth = 0
    let braceDepth = 0

    for (const char of pattern) {
      if (char === '[') bracketDepth++
      else if (char === ']') bracketDepth--
      else if (char === '{') braceDepth++
      else if (char === '}') braceDepth--

      if (bracketDepth < 0 || braceDepth < 0) {
        return false
      }
    }

    return bracketDepth === 0 && braceDepth === 0
  } catch {
    return false
  }
}

/**
 * Validate port number
 */
export function isValidPort(port: number | string): boolean {
  const portNum = typeof port === 'string' ? parseInt(port, 10) : port
  return !Number.isNaN(portNum) && portNum >= 1 && portNum <= 65535
}

/**
 * Validate timeout value
 */
export function isValidTimeout(timeout: number): boolean {
  return timeout > 0 && timeout <= 300000 // Max 5 minutes
}

/**
 * Validate log level
 * PERF-003: Uses Set.has() for O(1) lookup
 */
export function isValidLogLevel(level: string): boolean {
  return VALID_LOG_LEVELS.has(level.toLowerCase())
}

/**
 * Validate update target
 * PERF-003: Uses Set.has() for O(1) lookup
 */
export function isValidUpdateTarget(target: string): boolean {
  return VALID_UPDATE_TARGETS.has(target.toLowerCase())
}

/**
 * Validate output format
 * PERF-003: Uses Set.has() for O(1) lookup
 */
export function isValidOutputFormat(format: string): boolean {
  return VALID_OUTPUT_FORMATS.has(format.toLowerCase())
}

/**
 * Validate CLI command options
 */
export function validateCliOptions(options: Record<string, unknown>): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate workspace path
  if (typeof options.workspace === 'string' && !isValidPath(options.workspace)) {
    errors.push('Invalid workspace path')
  }

  // Validate registry URL
  if (typeof options.registry === 'string' && !isValidUrl(options.registry)) {
    errors.push('Invalid registry URL')
  }

  // Validate timeout
  if (typeof options.timeout === 'number' && !isValidTimeout(options.timeout)) {
    errors.push('Invalid timeout value (must be between 1 and 300000ms)')
  }

  // Validate target
  if (typeof options.target === 'string' && !isValidUpdateTarget(options.target)) {
    errors.push('Invalid update target (must be: latest, greatest, minor, patch, newest)')
  }

  // Validate format
  if (typeof options.format === 'string' && !isValidOutputFormat(options.format)) {
    errors.push('Invalid output format (must be: table, json, yaml, minimal)')
  }

  // Validate include patterns
  if (Array.isArray(options.include)) {
    for (const pattern of options.include) {
      if (typeof pattern === 'string' && !isValidGlob(pattern)) {
        warnings.push(`Invalid include pattern: ${pattern}`)
      }
    }
  }

  // Validate exclude patterns
  if (Array.isArray(options.exclude)) {
    for (const pattern of options.exclude) {
      if (typeof pattern === 'string' && !isValidGlob(pattern)) {
        warnings.push(`Invalid exclude pattern: ${pattern}`)
      }
    }
  }

  // Validate catalog name
  if (typeof options.catalog === 'string') {
    if (options.catalog.trim() === '') {
      errors.push('Catalog name cannot be empty')
    }
    if (options.catalog.includes('/') || options.catalog.includes('\\')) {
      errors.push('Catalog name cannot contain path separators')
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings)
}

/**
 * Type guard to check if value is a record object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate configuration object
 */
export function validateConfig(config: Record<string, unknown>): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate registry settings
  if (isRecord(config.registry)) {
    const registry = config.registry
    if (typeof registry.url === 'string' && !isValidUrl(registry.url)) {
      errors.push('Invalid registry URL in configuration')
    }

    if (typeof registry.timeout === 'number' && !isValidTimeout(registry.timeout)) {
      errors.push('Invalid registry timeout in configuration')
    }

    if (typeof registry.retries === 'number' && (registry.retries < 0 || registry.retries > 10)) {
      warnings.push('Registry retries should be between 0 and 10')
    }
  }

  // Validate update settings
  if (isRecord(config.update)) {
    const update = config.update
    if (typeof update.target === 'string' && !isValidUpdateTarget(update.target)) {
      errors.push('Invalid update target in configuration')
    }
  }

  // Validate output settings
  if (isRecord(config.output)) {
    const output = config.output
    if (typeof output.format === 'string' && !isValidOutputFormat(output.format)) {
      errors.push('Invalid output format in configuration')
    }
  }

  // Validate logging settings
  if (isRecord(config.logging)) {
    const logging = config.logging
    if (typeof logging.level === 'string' && !isValidLogLevel(logging.level)) {
      errors.push('Invalid log level in configuration')
    }

    if (typeof logging.file === 'string' && !isValidPath(logging.file)) {
      errors.push('Invalid log file path in configuration')
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings)
}

/**
 * Sanitize string input
 */
export function sanitizeString(
  input: string,
  options: {
    maxLength?: number
    allowedChars?: RegExp
    stripHtml?: boolean
  } = {}
): string {
  let result = input

  // Strip HTML tags if requested with comprehensive multi-pass sanitization
  if (options.stripHtml) {
    let previousLength: number

    // Multi-pass sanitization to handle nested and complex patterns
    do {
      previousLength = result.length

      // Remove HTML tags, including malformed ones
      result = result.replace(/<[^>]*>?/g, '')

      // Remove HTML entities
      result = result.replace(/&[a-zA-Z0-9#]+;/g, '')

      // Remove any remaining < or > characters that might be part of incomplete tags
      result = result.replace(/[<>]/g, '')

      // Remove potentially dangerous protocol schemes
      result = result.replace(/javascript:/gi, '')
      result = result.replace(/data:/gi, '')
      result = result.replace(/vbscript:/gi, '')
      result = result.replace(/file:/gi, '')
      result = result.replace(/ftp:/gi, '')

      // Remove event handlers
      result = result.replace(/on\w+\s*=/gi, '')

      // Remove script-related content
      result = result.replace(/script[\s\S]*?\/script/gi, '')
      result = result.replace(/style[\s\S]*?\/style/gi, '')

      // Remove control characters and non-printable characters
      // eslint-disable-next-line no-control-regex
      result = result.replace(/[\x00-\x1F\x7F-\x9F]/g, '')

      // Remove potentially dangerous CSS expressions
      result = result.replace(/expression\s*\(/gi, '')
      result = result.replace(/url\s*\(/gi, '')
    } while (result.length !== previousLength && result.length > 0)
  }

  // Filter allowed characters
  if (options.allowedChars) {
    result = result.replace(new RegExp(`[^${options.allowedChars.source}]`, 'g'), '')
  }

  // Truncate to max length
  if (options.maxLength && result.length > options.maxLength) {
    result = result.substring(0, options.maxLength)
  }

  return result.trim()
}

/**
 * Validate and sanitize package name
 */
export function sanitizePackageName(name: string): string {
  return sanitizeString(name, {
    maxLength: 214,
    allowedChars: /[a-z0-9@/._~*-]/,
  }).toLowerCase()
}

// ============================================================
// QUAL-015: PackageFilterConfig Runtime Validation
// ============================================================

// Pre-built Sets for O(1) validation lookups
const VALID_LOCALES = new Set(['en', 'zh', 'ja', 'ko', 'de', 'fr', 'es'])
const VALID_TARGETS = new Set(['latest', 'greatest', 'minor', 'patch', 'newest'])
const VALID_FORMATS = new Set(['table', 'json', 'yaml', 'minimal'])

/**
 * Configuration validation result with typed config
 */
export interface ConfigValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Type guard to check if value is an object (not null, not array)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Type guard to check if value is a string array
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Validate DefaultsConfig structure
 */
function validateDefaultsConfig(defaults: unknown, errors: string[], warnings: string[]): void {
  if (!isPlainObject(defaults)) {
    errors.push('defaults must be an object')
    return
  }

  if (defaults.target !== undefined) {
    if (typeof defaults.target !== 'string' || !VALID_TARGETS.has(defaults.target)) {
      errors.push(`defaults.target must be one of: ${[...VALID_TARGETS].join(', ')}`)
    }
  }

  if (defaults.format !== undefined) {
    if (typeof defaults.format !== 'string' || !VALID_FORMATS.has(defaults.format)) {
      errors.push(`defaults.format must be one of: ${[...VALID_FORMATS].join(', ')}`)
    }
  }

  const booleanFields = ['includePrerelease', 'interactive', 'dryRun', 'createBackup']
  for (const field of booleanFields) {
    if (defaults[field] !== undefined && typeof defaults[field] !== 'boolean') {
      warnings.push(`defaults.${field} should be a boolean`)
    }
  }
}

/**
 * Validate PackageRule structure
 */
function validatePackageRule(
  rule: unknown,
  index: number,
  errors: string[],
  warnings: string[]
): void {
  if (!isPlainObject(rule)) {
    errors.push(`packageRules[${index}] must be an object`)
    return
  }

  if (!Array.isArray(rule.patterns) || !isStringArray(rule.patterns)) {
    errors.push(`packageRules[${index}].patterns must be an array of strings`)
  }

  if (rule.target !== undefined) {
    if (typeof rule.target !== 'string' || !VALID_TARGETS.has(rule.target)) {
      errors.push(`packageRules[${index}].target must be one of: ${[...VALID_TARGETS].join(', ')}`)
    }
  }

  if (rule.relatedPackages !== undefined && !isStringArray(rule.relatedPackages)) {
    errors.push(`packageRules[${index}].relatedPackages must be an array of strings`)
  }

  const booleanFields = ['autoUpdate', 'requireConfirmation', 'groupUpdate']
  for (const field of booleanFields) {
    if (rule[field] !== undefined && typeof rule[field] !== 'boolean') {
      warnings.push(`packageRules[${index}].${field} should be a boolean`)
    }
  }
}

/**
 * Validate SecurityConfig structure
 */
function validateSecurityConfig(security: unknown, errors: string[], warnings: string[]): void {
  if (!isPlainObject(security)) {
    errors.push('security must be an object')
    return
  }

  const booleanFields = [
    'autoFixVulnerabilities',
    'allowMajorForSecurity',
    'notifyOnSecurityUpdate',
    'enableCheck',
  ]
  for (const field of booleanFields) {
    if (security[field] !== undefined && typeof security[field] !== 'boolean') {
      warnings.push(`security.${field} should be a boolean`)
    }
  }

  if (security.cacheMinutes !== undefined && typeof security.cacheMinutes !== 'number') {
    warnings.push('security.cacheMinutes should be a number')
  }
}

/**
 * Validate AdvancedConfig structure
 */
function validateAdvancedConfig(advanced: unknown, errors: string[], warnings: string[]): void {
  if (!isPlainObject(advanced)) {
    errors.push('advanced must be an object')
    return
  }

  const numberFields = ['concurrency', 'timeout', 'retries', 'cacheValidityMinutes', 'rateLimit']
  for (const field of numberFields) {
    if (advanced[field] !== undefined && typeof advanced[field] !== 'number') {
      warnings.push(`advanced.${field} should be a number`)
    }
  }

  if (advanced.checkForUpdates !== undefined && typeof advanced.checkForUpdates !== 'boolean') {
    warnings.push('advanced.checkForUpdates should be a boolean')
  }

  const stringFields = ['registry', 'npmDownloadsApiUrl']
  for (const field of stringFields) {
    if (advanced[field] !== undefined && typeof advanced[field] !== 'string') {
      warnings.push(`advanced.${field} should be a string`)
    }
  }
}

/**
 * Validate MonorepoConfig structure
 */
function validateMonorepoConfig(monorepo: unknown, errors: string[], _warnings: string[]): void {
  if (!isPlainObject(monorepo)) {
    errors.push('monorepo must be an object')
    return
  }

  if (monorepo.syncVersions !== undefined && !isStringArray(monorepo.syncVersions)) {
    errors.push('monorepo.syncVersions must be an array of strings')
  }

  if (monorepo.catalogPriority !== undefined && !isStringArray(monorepo.catalogPriority)) {
    errors.push('monorepo.catalogPriority must be an array of strings')
  }
}

/**
 * QUAL-015: Validate PackageFilterConfig structure at runtime
 *
 * Performs comprehensive validation of configuration objects to ensure
 * type safety without relying on unsafe type assertions.
 *
 * @param config - The configuration object to validate
 * @returns Validation result with errors and warnings
 */
export function validatePackageFilterConfig(config: unknown): ConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Must be an object
  if (!isPlainObject(config)) {
    return {
      isValid: false,
      errors: ['Configuration must be an object'],
      warnings: [],
    }
  }

  // Validate locale
  if (config.locale !== undefined) {
    if (typeof config.locale !== 'string' || !VALID_LOCALES.has(config.locale)) {
      errors.push(`locale must be one of: ${[...VALID_LOCALES].join(', ')}`)
    }
  }

  // Validate exclude/include arrays
  if (config.exclude !== undefined && !isStringArray(config.exclude)) {
    errors.push('exclude must be an array of strings')
  }

  if (config.include !== undefined && !isStringArray(config.include)) {
    errors.push('include must be an array of strings')
  }

  // Validate nested configs
  if (config.defaults !== undefined) {
    validateDefaultsConfig(config.defaults, errors, warnings)
  }

  if (config.packageRules !== undefined) {
    if (!Array.isArray(config.packageRules)) {
      errors.push('packageRules must be an array')
    } else {
      config.packageRules.forEach((rule, index) => {
        validatePackageRule(rule, index, errors, warnings)
      })
    }
  }

  if (config.security !== undefined) {
    validateSecurityConfig(config.security, errors, warnings)
  }

  if (config.advanced !== undefined) {
    validateAdvancedConfig(config.advanced, errors, warnings)
  }

  if (config.monorepo !== undefined) {
    validateMonorepoConfig(config.monorepo, errors, warnings)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}
