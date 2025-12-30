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
   * PERF-002: Single-pass grouping instead of 4 separate filter+map operations
   */
  static getSkippedPackages(): {
    notFound: string[]
    network: string[]
    emptyVersion: string[]
    other: string[]
  } {
    const grouped = {
      notFound: [] as string[],
      network: [] as string[],
      emptyVersion: [] as string[],
      other: [] as string[],
    }

    // Single pass through the array
    for (const pkg of ErrorTracker.skippedPackages) {
      switch (pkg.reason) {
        case 'not-found':
          grouped.notFound.push(pkg.name)
          break
        case 'network':
          grouped.network.push(pkg.name)
          break
        case 'empty-version':
          grouped.emptyVersion.push(pkg.name)
          break
        default:
          grouped.other.push(pkg.name)
      }
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
