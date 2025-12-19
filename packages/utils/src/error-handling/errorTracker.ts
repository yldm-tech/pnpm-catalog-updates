/**
 * Error Tracker
 *
 * Tracks skipped packages and error statistics for summary reporting.
 */

export interface SkippedPackage {
  name: string
  reason: 'not-found' | 'network' | 'empty-version' | 'other'
  originalError?: string
}

export class ErrorTracker {
  private static skippedPackages: SkippedPackage[] = []
  private static errorCounts = {
    notFound: 0,
    network: 0,
    emptyVersion: 0,
    security: 0,
    other: 0,
  }

  /**
   * Track a skipped package
   */
  static trackSkippedPackage(packageName: string, error: Error): void {
    let reason: SkippedPackage['reason'] = 'other'

    if (error.message.includes('404') || error.message.includes('Not found')) {
      reason = 'not-found'
      ErrorTracker.errorCounts.notFound++
    } else if (error.message.includes('Version string cannot be empty')) {
      reason = 'empty-version'
      ErrorTracker.errorCounts.emptyVersion++
    } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      reason = 'network'
      ErrorTracker.errorCounts.network++
    } else {
      ErrorTracker.errorCounts.other++
    }

    ErrorTracker.skippedPackages.push({
      name: packageName,
      reason,
      originalError: error.message,
    })
  }

  /**
   * Track a security check failure
   */
  static trackSecurityFailure(): void {
    ErrorTracker.errorCounts.security++
  }

  /**
   * Get skipped packages by reason
   */
  static getSkippedPackages(): {
    notFound: string[]
    network: string[]
    emptyVersion: string[]
    other: string[]
  } {
    const grouped = {
      notFound: ErrorTracker.skippedPackages
        .filter((p) => p.reason === 'not-found')
        .map((p) => p.name),
      network: ErrorTracker.skippedPackages
        .filter((p) => p.reason === 'network')
        .map((p) => p.name),
      emptyVersion: ErrorTracker.skippedPackages
        .filter((p) => p.reason === 'empty-version')
        .map((p) => p.name),
      other: ErrorTracker.skippedPackages.filter((p) => p.reason === 'other').map((p) => p.name),
    }

    return grouped
  }

  /**
   * Get error statistics
   */
  static getErrorStats(): typeof ErrorTracker.errorCounts {
    return { ...ErrorTracker.errorCounts }
  }

  /**
   * Get total skipped count
   */
  static getTotalSkipped(): number {
    return ErrorTracker.skippedPackages.length
  }

  /**
   * Reset all tracking data
   */
  static reset(): void {
    ErrorTracker.skippedPackages = []
    ErrorTracker.errorCounts = {
      notFound: 0,
      network: 0,
      emptyVersion: 0,
      security: 0,
      other: 0,
    }
  }

  /**
   * Get all skipped package details
   */
  static getAllSkippedPackages(): SkippedPackage[] {
    return [...ErrorTracker.skippedPackages]
  }
}
