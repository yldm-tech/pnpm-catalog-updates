/**
 * English Translations (Default)
 */

import type { TranslationDictionary } from '../types.js'

export const en: TranslationDictionary = {
  // Error messages
  'error.packageNotFound': 'Package "{{packageName}}" does not exist in npm registry',
  'error.packageNotFoundWithSuggestion': 'Package "{{packageName}}" does not exist',
  'error.possiblePackageNames': 'Possible correct package names:',
  'error.checkPackageName':
    'Please check if the package name is correct, or the package may have been removed',
  'error.emptyVersion': 'Version information for package "{{packageName}}" is empty',
  'error.emptyVersionReasons':
    "This may be caused by:\n   • Issues with the package's package.json configuration\n   • Incorrect version format in catalog configuration\n   • npm registry data synchronization issues",
  'error.networkError': 'Network issue encountered while checking package "{{packageName}}"',
  'error.networkRetry': 'Please try again later or check your network connection',
  'error.registryError': 'Registry error for "{{packageName}}": {{message}}',
  'error.workspaceNotFound': 'No pnpm workspace found at "{{path}}"',
  'error.catalogNotFound': 'Catalog "{{catalogName}}" not found',
  'error.invalidVersion': 'Invalid version "{{version}}"',
  'error.invalidVersionRange': 'Invalid version range "{{range}}"',
  'error.configurationError': 'Configuration error: {{message}}',
  'error.fileSystemError': 'File system error: {{message}}',
  'error.cacheError': 'Cache error: {{message}}',
  'error.securityCheckFailed': 'Security check failed for "{{packageName}}": {{message}}',
  'error.securityCheckUnavailable': 'Unable to check security status for "{{packageName}}"',
  'error.updateFailed': 'Update failed: {{message}}',
  'error.packageSkipped': 'Skipping package "{{packageName}}" (check failed)',
  'error.unknown': 'An unknown error occurred',

  // Success messages
  'success.updateComplete': 'Update completed successfully',
  'success.cacheCleared': 'Cache cleared successfully',
  'success.configInitialized': 'Configuration initialized successfully',
  'success.validationPassed': 'All validations passed',

  // Info messages
  'info.checkingUpdates': 'Checking for outdated catalog dependencies',
  'info.foundOutdated': '{{count}} outdated dependencies found',
  'info.noUpdatesFound': 'All catalog dependencies are up to date!',
  'info.runWithUpdate': 'Run with --update to apply updates',
  'info.majorWarning': 'Major updates may contain breaking changes',
  'info.securityUpdates': '{{count}} security updates available',

  // Warning messages
  'warning.configExists': 'Configuration file already exists',
  'warning.workspaceNotDetected': 'PNPM workspace structure not detected',
  'warning.deprecatedPackage': 'Package "{{packageName}}" is deprecated',

  // Summary messages
  'summary.skippedPackages': 'Skipped {{count}} package checks:',
  'summary.notFoundPackages': 'Not found ({{count}}): {{packages}}',
  'summary.emptyVersionPackages': 'Empty version info ({{count}}): {{packages}}',
  'summary.networkIssuePackages': 'Network issues ({{count}}): {{packages}}',
  'summary.otherIssuePackages': 'Other issues ({{count}}): {{packages}}',
  'summary.securityCheckFailures': 'Security check failures: {{count}}',

  // Command messages
  'command.workspace.title': 'Workspace',
  'command.workspace.path': 'Path',
  'command.workspace.packages': 'Packages',
  'command.workspace.catalogs': 'Catalogs',
  'command.workspace.catalogNames': 'Catalog names',
  'command.check.analyzing': 'Analyzing catalog dependencies...',
  'command.check.summary': 'Summary',
  'command.check.majorUpdates': '{{count}} major updates',
  'command.check.minorUpdates': '{{count}} minor updates',
  'command.check.patchUpdates': '{{count}} patch updates',
  'command.init.creating': 'Creating PCU configuration...',
  'command.init.success': 'PCU configuration initialized successfully!',
  'command.init.nextSteps': 'Next steps',
}
