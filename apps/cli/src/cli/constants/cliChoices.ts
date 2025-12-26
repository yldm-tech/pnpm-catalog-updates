/**
 * CLI Option Choices
 *
 * Centralized definitions for CLI option values.
 * Used by both Commander.js for validation and Command classes for programmatic validation.
 * This ensures consistency across CLI and API usage.
 */

/**
 * Valid output format options (including CI/CD formats)
 */
export const FORMAT_CHOICES = [
  'table',
  'json',
  'yaml',
  'minimal',
  'github',
  'gitlab',
  'junit',
  'sarif',
] as const
export type FormatChoice = (typeof FORMAT_CHOICES)[number]

/**
 * CI/CD specific output formats
 */
export const CI_FORMAT_CHOICES = ['github', 'gitlab', 'junit', 'sarif'] as const
export type CIFormatChoice = (typeof CI_FORMAT_CHOICES)[number]

/**
 * Check if format is a CI/CD format
 */
export function isCIFormatChoice(value: string): value is CIFormatChoice {
  return CI_FORMAT_CHOICES.includes(value as CIFormatChoice)
}

/**
 * Valid update target options
 */
export const TARGET_CHOICES = ['latest', 'greatest', 'minor', 'patch', 'newest'] as const
export type TargetChoice = (typeof TARGET_CHOICES)[number]

/**
 * Valid AI provider options
 */
export const PROVIDER_CHOICES = ['auto', 'claude', 'gemini', 'codex'] as const
export type ProviderChoice = (typeof PROVIDER_CHOICES)[number]

/**
 * Valid analysis type options
 */
export const ANALYSIS_TYPE_CHOICES = ['impact', 'security', 'compatibility', 'recommend'] as const
export type AnalysisTypeChoice = (typeof ANALYSIS_TYPE_CHOICES)[number]

/**
 * Valid severity level options
 */
export const SEVERITY_CHOICES = ['low', 'moderate', 'high', 'critical'] as const
export type SeverityChoice = (typeof SEVERITY_CHOICES)[number]

/**
 * All CLI choices grouped for Commander.js registration
 */
export const CLI_CHOICES = {
  format: FORMAT_CHOICES,
  target: TARGET_CHOICES,
  provider: PROVIDER_CHOICES,
  analysisType: ANALYSIS_TYPE_CHOICES,
  severity: SEVERITY_CHOICES,
} as const

/**
 * Validation helper functions
 */
export function isValidFormat(value: string): value is FormatChoice {
  return FORMAT_CHOICES.includes(value as FormatChoice)
}

export function isValidTarget(value: string): value is TargetChoice {
  return TARGET_CHOICES.includes(value as TargetChoice)
}

export function isValidProvider(value: string): value is ProviderChoice {
  return PROVIDER_CHOICES.includes(value as ProviderChoice)
}

export function isValidAnalysisType(value: string): value is AnalysisTypeChoice {
  return ANALYSIS_TYPE_CHOICES.includes(value as AnalysisTypeChoice)
}

export function isValidSeverity(value: string): value is SeverityChoice {
  return SEVERITY_CHOICES.includes(value as SeverityChoice)
}
