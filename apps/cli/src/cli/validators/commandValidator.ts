/**
 * CLI Command Validation
 *
 * QUAL-002: Unified validation logic for CLI commands.
 * Provides composable validators that can be combined per command.
 */

import { existsSync } from 'node:fs'
import { createValidationResult, t, type ValidationResult } from '@pcu/utils'
import {
  FORMAT_CHOICES,
  isValidAnalysisType,
  isValidFormat,
  isValidProvider,
  isValidSeverity,
  isValidTarget,
  SEVERITY_CHOICES,
  TARGET_CHOICES,
} from '../constants/cliChoices.js'

/**
 * Validation rule function signature
 */
type ValidationRule<T> = (options: T) => { errors: string[]; warnings: string[] }

/**
 * Base options that many commands share
 */
export interface BaseCommandOptions {
  workspace?: string
  catalog?: string
  format?: string
  verbose?: boolean
  color?: boolean
}

/**
 * Options that include update target
 */
export interface TargetOptions {
  target?: string
}

/**
 * Options for interactive mode
 */
export interface InteractiveOptions {
  interactive?: boolean
  dryRun?: boolean
}

/**
 * Options for AI analysis
 */
export interface AIOptions {
  ai?: boolean
  provider?: string
  analysisType?: string
  skipCache?: boolean
}

/**
 * Options for security command
 */
export interface SecurityOptions {
  severity?: string
}

/**
 * Graph command specific options
 */
export interface GraphOptions {
  type?: string
}

/**
 * Create validation result from errors and warnings
 */
function toValidationResult(errors: string[], warnings: string[]): ValidationResult {
  return createValidationResult(errors.length === 0, errors, warnings)
}

/**
 * Compose multiple validation rules into a single validator
 */
export function composeValidators<T>(
  ...rules: ValidationRule<T>[]
): (options: T) => ValidationResult {
  return (options: T) => {
    const allErrors: string[] = []
    const allWarnings: string[] = []

    for (const rule of rules) {
      const { errors, warnings } = rule(options)
      allErrors.push(...errors)
      allWarnings.push(...warnings)
    }

    return toValidationResult(allErrors, allWarnings)
  }
}

// ============================================================================
// Individual Validation Rules
// ============================================================================

/**
 * Validate output format
 */
export function validateFormat<T extends { format?: string }>(
  options: T
): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (options.format && !isValidFormat(options.format)) {
    errors.push(t('validation.invalidFormat'))
  }

  return { errors, warnings }
}

/**
 * Validate update target
 */
export function validateTarget<T extends TargetOptions>(
  options: T
): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (options.target && !isValidTarget(options.target)) {
    errors.push(t('validation.invalidTarget'))
  }

  return { errors, warnings }
}

/**
 * Validate workspace path exists
 */
export function validateWorkspacePath<T extends { workspace?: string }>(
  options: T
): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (options.workspace && !existsSync(options.workspace)) {
    errors.push(t('validation.workspaceDirNotExist', { path: options.workspace }))
  }

  return { errors, warnings }
}

/**
 * Validate interactive mode conflicts
 */
export function validateInteractiveConflicts<T extends InteractiveOptions>(
  options: T
): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (options.interactive && options.dryRun) {
    errors.push(t('validation.interactiveWithDryRun'))
  }

  return { errors, warnings }
}

/**
 * Validate AI provider options
 */
export function validateAIOptions<T extends AIOptions>(
  options: T
): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (options.provider && !isValidProvider(options.provider)) {
    errors.push(t('validation.invalidProvider'))
  }

  if (options.analysisType && !isValidAnalysisType(options.analysisType)) {
    errors.push(t('validation.invalidAnalysisType'))
  }

  return { errors, warnings }
}

/**
 * Validate severity level
 */
export function validateSeverity<T extends SecurityOptions>(
  options: T
): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (options.severity && !isValidSeverity(options.severity)) {
    errors.push(t('validation.invalidSeverity'))
  }

  return { errors, warnings }
}

/**
 * Validate graph type
 */
export function validateGraphType<T extends GraphOptions>(
  options: T
): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  const validTypes = ['catalog', 'package', 'full']

  if (options.type && !validTypes.includes(options.type)) {
    errors.push(t('validation.invalidGraphType', { validTypes: validTypes.join(', ') }))
  }

  return { errors, warnings }
}

/**
 * Validate graph format (subset of formats)
 */
export function validateGraphFormat<T extends { format?: string }>(
  options: T
): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  const validFormats = ['text', 'mermaid', 'dot', 'json']

  if (options.format && !validFormats.includes(options.format)) {
    errors.push(t('validation.invalidGraphFormat', { validFormats: validFormats.join(', ') }))
  }

  return { errors, warnings }
}

/**
 * Options for pattern validation
 */
export interface PatternOptions {
  include?: string[]
  exclude?: string[]
}

/**
 * Validate include/exclude patterns
 */
export function validatePatterns<T extends PatternOptions>(
  options: T
): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (options.include?.some((pattern) => !pattern.trim())) {
    errors.push(t('validation.includePatternsEmpty'))
  }

  if (options.exclude?.some((pattern) => !pattern.trim())) {
    errors.push(t('validation.excludePatternsEmpty'))
  }

  return { errors, warnings }
}

// ============================================================================
// Pre-composed Validators for Common Command Types
// ============================================================================

/**
 * Validator for check command
 */
export const validateCheckOptions = composeValidators<
  BaseCommandOptions & TargetOptions & PatternOptions
>(validateFormat, validateTarget, validatePatterns)

/**
 * Validator for update command
 */
export const validateUpdateOptions = composeValidators<
  BaseCommandOptions & TargetOptions & InteractiveOptions & AIOptions
>(validateFormat, validateTarget, validateInteractiveConflicts, validateAIOptions)

/**
 * Validator for security command
 */
export const validateSecurityOptions = composeValidators<BaseCommandOptions & SecurityOptions>(
  validateFormat,
  validateSeverity
)

/**
 * Validator for graph command
 */
export const validateGraphOptions = composeValidators<BaseCommandOptions & GraphOptions>(
  validateGraphFormat,
  validateGraphType
)

/**
 * Validator for init command
 */
export const validateInitOptions = composeValidators<BaseCommandOptions>(validateWorkspacePath)

// ============================================================================
// Legacy Compatibility - Returns string[] for existing command signatures
// ============================================================================

/**
 * Wrap validator to return only errors array (legacy compatibility)
 */
export function errorsOnly<T>(
  validator: (options: T) => ValidationResult
): (options: T) => string[] {
  return (options: T) => validator(options).errors
}

/**
 * Format choices for help text
 */
export function formatChoicesHelp(): string {
  return FORMAT_CHOICES.join(', ')
}

/**
 * Target choices for help text
 */
export function targetChoicesHelp(): string {
  return TARGET_CHOICES.join(', ')
}

/**
 * Severity choices for help text
 */
export function severityChoicesHelp(): string {
  return SEVERITY_CHOICES.join(', ')
}
