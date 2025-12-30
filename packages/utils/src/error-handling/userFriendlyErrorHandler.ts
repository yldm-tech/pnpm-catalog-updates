/**
 * User-Friendly Error Handler
 *
 * Provides user-friendly error messages instead of exposing technical details.
 * Categorizes errors and provides helpful suggestions where possible.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Logger } from '../logger/logger.js'
import { ErrorRenderer } from './errorRenderer.js'
import { ErrorTracker } from './errorTracker.js'

export interface ErrorContext {
  packageName?: string
  operation?: string
  details?: string
}

export interface PackageSuggestion {
  original: string
  suggestions: string[]
  reason: string
}

// Error pattern constants for robust error classification
const ERROR_PATTERNS = {
  NOT_FOUND: ['404', 'Not found', 'ENOTFOUND', 'not found'],
  TIMEOUT: ['timeout', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET'],
  EMPTY_VERSION: ['Version string cannot be empty'],
} as const

/**
 * Check if error message matches any of the patterns (centralized error pattern matching)
 */
function matchesErrorPattern(message: string, patterns: readonly string[]): boolean {
  const lowerMessage = message.toLowerCase()
  return patterns.some((pattern) => lowerMessage.includes(pattern.toLowerCase()))
}

// PERF-001: Lazy load package suggestions with async preloading to avoid blocking I/O
let _packageSuggestions: Map<string, string[]> | null = null
let _preloadPromise: Promise<void> | null = null

/**
 * PERF-001: Async preload package suggestions to avoid blocking I/O during error handling.
 * Call this during CLI startup to load suggestions in the background.
 * This is fire-and-forget - if it fails, getPackageSuggestions() returns empty map.
 */
export async function preloadPackageSuggestions(): Promise<void> {
  if (_packageSuggestions !== null) {
    return // Already loaded
  }

  if (_preloadPromise !== null) {
    return _preloadPromise // Loading in progress
  }

  _preloadPromise = (async () => {
    try {
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const dataPath = join(__dirname, 'data', 'packageSuggestions.json')
      const content = await readFile(dataPath, 'utf-8')
      const data = JSON.parse(content) as Record<string, string[]>
      _packageSuggestions = new Map(Object.entries(data))
    } catch (error) {
      // ERR-001: Log at warn level for better visibility of configuration issues
      const logger = Logger.getLogger('ErrorHandler')
      logger.warn('Failed to load package suggestions file', {
        error: error instanceof Error ? error.message : String(error),
        hint: 'Package name suggestions will be unavailable',
      })
      _packageSuggestions = new Map()
    }
  })()

  return _preloadPromise
}

/**
 * Get package suggestions synchronously.
 * Returns preloaded data if available, otherwise returns empty map.
 * Call preloadPackageSuggestions() during startup for best experience.
 */
function getPackageSuggestions(): Map<string, string[]> {
  if (_packageSuggestions !== null) {
    return _packageSuggestions
  }

  // If not preloaded, return empty map instead of blocking
  // The preload should be called during CLI startup
  return new Map()
}

export class UserFriendlyErrorHandler {
  private static logger = Logger.getLogger('ErrorHandler')

  /**
   * Handle package not found errors (404)
   */
  static handlePackageNotFound(packageName: string, context?: ErrorContext): void {
    const suggestions = getPackageSuggestions().get(packageName)

    // Delegate UI rendering to ErrorRenderer
    ErrorRenderer.renderPackageNotFound(packageName, suggestions)

    // Track for summary
    ErrorTracker.trackSkippedPackage(packageName, new Error('Package not found (404)'))

    // Log technical details for debugging
    UserFriendlyErrorHandler.logger.debug('Package not found', { packageName, context })
  }

  /**
   * Handle empty version errors
   */
  static handleEmptyVersion(packageName: string, context?: ErrorContext): void {
    // Delegate UI rendering to ErrorRenderer
    ErrorRenderer.renderEmptyVersion(packageName)

    // Track for summary
    ErrorTracker.trackSkippedPackage(packageName, new Error('Version string cannot be empty'))

    UserFriendlyErrorHandler.logger.debug('Empty version string', { packageName, context })
  }

  /**
   * Handle network/timeout errors
   */
  static handleNetworkError(packageName: string, error: Error, context?: ErrorContext): void {
    // Delegate UI rendering to ErrorRenderer
    ErrorRenderer.renderNetworkError(packageName)

    // Track for summary
    ErrorTracker.trackSkippedPackage(packageName, error)

    // Use debugError to preserve original stack trace
    UserFriendlyErrorHandler.logger.debugError('Network error', error, {
      packageName,
      context,
    })
  }

  /**
   * Handle security check failures
   */
  static handleSecurityCheckFailure(
    packageName: string,
    error: Error,
    context?: ErrorContext
  ): void {
    // Track for statistics
    ErrorTracker.trackSecurityFailure()

    // Use debugError to preserve original stack trace for debugging
    UserFriendlyErrorHandler.logger.debugError(`Security check failed for ${packageName}`, error, {
      context,
    })

    // Don't spam the user with security check failures unless it's critical
    if (context?.operation === 'update' || context?.operation === 'security-audit') {
      ErrorRenderer.renderSecurityCheckUnavailable(packageName)
    }
  }

  /**
   * Handle retry attempts silently
   */
  static handleRetryAttempt(
    packageName: string,
    attempt: number,
    maxRetries: number,
    error: Error
  ): void {
    // Use debugError to preserve stack trace for debugging
    UserFriendlyErrorHandler.logger.debugError(
      `Retry attempt ${attempt}/${maxRetries} for ${packageName}`,
      error
    )

    // Only show to user on final failure
    if (attempt === maxRetries) {
      UserFriendlyErrorHandler.handleFinalFailure(packageName, error)
    }
  }

  /**
   * Handle final failure after retries
   */
  static handleFinalFailure(packageName: string, error: Error): void {
    // Use centralized error pattern matching
    if (matchesErrorPattern(error.message, ERROR_PATTERNS.NOT_FOUND)) {
      UserFriendlyErrorHandler.handlePackageNotFound(packageName)
    } else if (matchesErrorPattern(error.message, ERROR_PATTERNS.TIMEOUT)) {
      UserFriendlyErrorHandler.handleNetworkError(packageName, error)
    } else if (matchesErrorPattern(error.message, ERROR_PATTERNS.EMPTY_VERSION)) {
      UserFriendlyErrorHandler.handleEmptyVersion(packageName)
    } else {
      // Generic error handling - preserve stack trace for debugging
      ErrorRenderer.renderPackageSkipped(packageName)
      UserFriendlyErrorHandler.logger.debugError('Package check failed', error, {
        packageName,
      })
    }
  }

  /**
   * Handle general package query failures
   */
  static handlePackageQueryFailure(
    packageName: string,
    error: Error,
    context?: ErrorContext
  ): void {
    // Categorize error using centralized pattern matching
    if (matchesErrorPattern(error.message, ERROR_PATTERNS.NOT_FOUND)) {
      UserFriendlyErrorHandler.handlePackageNotFound(packageName, context)
    } else if (matchesErrorPattern(error.message, ERROR_PATTERNS.EMPTY_VERSION)) {
      UserFriendlyErrorHandler.handleEmptyVersion(packageName, context)
    } else if (matchesErrorPattern(error.message, ERROR_PATTERNS.TIMEOUT)) {
      UserFriendlyErrorHandler.handleNetworkError(packageName, error, context)
    } else {
      // For other errors, skip silently but preserve stack trace for debugging
      ErrorTracker.trackSkippedPackage(packageName, error)
      UserFriendlyErrorHandler.logger.debugError(`Package query failed for ${packageName}`, error, {
        context,
      })
    }
  }

  /**
   * Show summary of skipped packages
   */
  static showSkippedPackagesSummary(): void {
    const totalSkipped = ErrorTracker.getTotalSkipped()
    if (totalSkipped === 0) return

    const grouped = ErrorTracker.getSkippedPackages()
    const stats = ErrorTracker.getErrorStats()

    // Delegate UI rendering to ErrorRenderer
    ErrorRenderer.renderSkippedPackagesSummary({
      total: totalSkipped,
      notFound: grouped.notFound,
      emptyVersion: grouped.emptyVersion,
      network: grouped.network,
      other: grouped.other,
      securityFailures: stats.security,
    })
  }

  /**
   * Get statistics for reporting
   */
  static getStatistics(): {
    totalSkipped: number
    errorBreakdown: ReturnType<typeof ErrorTracker.getErrorStats>
    skippedPackages: ReturnType<typeof ErrorTracker.getSkippedPackages>
  } {
    return {
      totalSkipped: ErrorTracker.getTotalSkipped(),
      errorBreakdown: ErrorTracker.getErrorStats(),
      skippedPackages: ErrorTracker.getSkippedPackages(),
    }
  }

  /**
   * Reset error tracking (useful for testing)
   */
  static resetTracking(): void {
    ErrorTracker.reset()
  }

  /**
   * Add a new package suggestion
   */
  static addPackageSuggestion(originalName: string, suggestions: string[]): void {
    getPackageSuggestions().set(originalName, suggestions)
  }

  /**
   * Get suggestions for a package name
   */
  static getSuggestionsForPackage(packageName: string): string[] {
    return getPackageSuggestions().get(packageName) || []
  }
}
