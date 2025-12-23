/**
 * Internationalization Types
 *
 * Type definitions for the i18n module.
 */

/**
 * Supported locales
 */
export type Locale = 'en' | 'zh' | 'ja' | 'es' | 'de' | 'fr' | 'ko'

/**
 * Translation key structure
 * Using dot notation for nested keys
 */
export type TranslationKey =
  // Error messages
  | 'error.packageNotFound'
  | 'error.packageNotFoundWithSuggestion'
  | 'error.possiblePackageNames'
  | 'error.checkPackageName'
  | 'error.emptyVersion'
  | 'error.emptyVersionReasons'
  | 'error.networkError'
  | 'error.networkRetry'
  | 'error.registryError'
  | 'error.workspaceNotFound'
  | 'error.catalogNotFound'
  | 'error.invalidVersion'
  | 'error.invalidVersionRange'
  | 'error.configurationError'
  | 'error.fileSystemError'
  | 'error.cacheError'
  | 'error.securityCheckFailed'
  | 'error.securityCheckUnavailable'
  | 'error.updateFailed'
  | 'error.packageSkipped'
  | 'error.unknown'
  // Success messages
  | 'success.updateComplete'
  | 'success.cacheCleared'
  | 'success.configInitialized'
  | 'success.validationPassed'
  // Info messages
  | 'info.checkingUpdates'
  | 'info.foundOutdated'
  | 'info.noUpdatesFound'
  | 'info.runWithUpdate'
  | 'info.majorWarning'
  | 'info.securityUpdates'
  // Warning messages
  | 'warning.configExists'
  | 'warning.workspaceNotDetected'
  | 'warning.deprecatedPackage'
  // Summary messages
  | 'summary.skippedPackages'
  | 'summary.notFoundPackages'
  | 'summary.emptyVersionPackages'
  | 'summary.networkIssuePackages'
  | 'summary.otherIssuePackages'
  | 'summary.securityCheckFailures'
  // Command messages
  | 'command.workspace.title'
  | 'command.workspace.path'
  | 'command.workspace.packages'
  | 'command.workspace.catalogs'
  | 'command.workspace.catalogNames'
  | 'command.check.analyzing'
  | 'command.check.summary'
  | 'command.check.majorUpdates'
  | 'command.check.minorUpdates'
  | 'command.check.patchUpdates'
  | 'command.init.creating'
  | 'command.init.success'
  | 'command.init.nextSteps'

/**
 * Parameters for translation interpolation
 */
export interface TranslationParams {
  [key: string]: string | number | boolean | undefined
}

/**
 * Translation dictionary structure
 */
export type TranslationDictionary = Record<TranslationKey, string>

/**
 * Partial translation dictionary for locale files
 * Allows incomplete translations with fallback to default locale
 */
export type PartialTranslationDictionary = Partial<TranslationDictionary>
