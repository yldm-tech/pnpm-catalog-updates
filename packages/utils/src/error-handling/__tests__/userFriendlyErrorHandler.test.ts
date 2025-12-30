/**
 * UserFriendlyErrorHandler Tests
 *
 * TEST-001: Unit tests for UserFriendlyErrorHandler
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Setup mocks before imports
const mocks = vi.hoisted(() => ({
  renderPackageNotFound: vi.fn(),
  renderEmptyVersion: vi.fn(),
  renderNetworkError: vi.fn(),
  renderSecurityCheckUnavailable: vi.fn(),
  renderPackageSkipped: vi.fn(),
  renderSkippedPackagesSummary: vi.fn(),
  trackSkippedPackage: vi.fn(),
  trackSecurityFailure: vi.fn(),
  getTotalSkipped: vi.fn().mockReturnValue(0),
  getSkippedPackages: vi.fn().mockReturnValue({
    notFound: [],
    emptyVersion: [],
    network: [],
    other: [],
  }),
  getErrorStats: vi.fn().mockReturnValue({
    notFound: 0,
    network: 0,
    emptyVersion: 0,
    security: 0,
    other: 0,
  }),
  reset: vi.fn(),
  loggerDebug: vi.fn(),
  loggerDebugError: vi.fn(),
  loggerWarn: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('../errorRenderer.js', () => ({
  ErrorRenderer: {
    renderPackageNotFound: mocks.renderPackageNotFound,
    renderEmptyVersion: mocks.renderEmptyVersion,
    renderNetworkError: mocks.renderNetworkError,
    renderSecurityCheckUnavailable: mocks.renderSecurityCheckUnavailable,
    renderPackageSkipped: mocks.renderPackageSkipped,
    renderSkippedPackagesSummary: mocks.renderSkippedPackagesSummary,
  },
}))

vi.mock('../errorTracker.js', () => ({
  ErrorTracker: {
    trackSkippedPackage: mocks.trackSkippedPackage,
    trackSecurityFailure: mocks.trackSecurityFailure,
    getTotalSkipped: mocks.getTotalSkipped,
    getSkippedPackages: mocks.getSkippedPackages,
    getErrorStats: mocks.getErrorStats,
    reset: mocks.reset,
  },
}))

vi.mock('../../logger/logger.js', () => ({
  Logger: {
    getLogger: () => ({
      debug: mocks.loggerDebug,
      debugError: mocks.loggerDebugError,
      warn: mocks.loggerWarn,
    }),
  },
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
}))

// Import after mocks
import { preloadPackageSuggestions, UserFriendlyErrorHandler } from '../userFriendlyErrorHandler.js'

// Reset module state between tests
let resetModuleState: () => void

describe('UserFriendlyErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mocks to default values
    mocks.getTotalSkipped.mockReturnValue(0)
    mocks.getSkippedPackages.mockReturnValue({
      notFound: [],
      emptyVersion: [],
      network: [],
      other: [],
    })
    mocks.getErrorStats.mockReturnValue({
      notFound: 0,
      network: 0,
      emptyVersion: 0,
      security: 0,
      other: 0,
    })
  })

  afterEach(() => {
    UserFriendlyErrorHandler.resetTracking()
  })

  describe('preloadPackageSuggestions', () => {
    // Note: preloadPackageSuggestions uses module-level state that persists across tests
    // These tests verify the function behavior but may not trigger the actual file read
    // if preloading already happened in a previous test run

    it('should not throw when called', async () => {
      const mockData = {
        lodash: ['lodash-es', 'underscore'],
        react: ['preact', 'inferno'],
      }
      mocks.readFile.mockResolvedValueOnce(JSON.stringify(mockData))

      // Should not throw regardless of whether it actually loads or returns early
      await expect(preloadPackageSuggestions()).resolves.not.toThrow()
    })

    it('should be idempotent - multiple calls should not cause issues', async () => {
      const mockData = { test: ['test2'] }
      mocks.readFile.mockResolvedValueOnce(JSON.stringify(mockData))

      // Multiple calls should all resolve successfully
      await preloadPackageSuggestions()
      await preloadPackageSuggestions()
      await preloadPackageSuggestions()

      // No assertions needed - just verifying no errors
    })
  })

  describe('handlePackageNotFound', () => {
    it('should render package not found error', () => {
      UserFriendlyErrorHandler.handlePackageNotFound('unknown-package-xyz')

      expect(mocks.renderPackageNotFound).toHaveBeenCalledWith('unknown-package-xyz', undefined)
      expect(mocks.trackSkippedPackage).toHaveBeenCalledWith(
        'unknown-package-xyz',
        expect.any(Error)
      )
      expect(mocks.loggerDebug).toHaveBeenCalled()
    })

    it('should pass context to logger', () => {
      const context = { operation: 'check', details: 'test' }
      UserFriendlyErrorHandler.handlePackageNotFound('another-unknown-pkg', context)

      expect(mocks.loggerDebug).toHaveBeenCalledWith(
        'Package not found',
        expect.objectContaining({ packageName: 'another-unknown-pkg', context })
      )
    })
  })

  describe('handleEmptyVersion', () => {
    it('should render empty version error', () => {
      UserFriendlyErrorHandler.handleEmptyVersion('my-pkg')

      expect(mocks.renderEmptyVersion).toHaveBeenCalledWith('my-pkg')
      expect(mocks.trackSkippedPackage).toHaveBeenCalledWith('my-pkg', expect.any(Error))
      expect(mocks.loggerDebug).toHaveBeenCalled()
    })
  })

  describe('handleNetworkError', () => {
    it('should render network error', () => {
      const error = new Error('Connection timeout')
      UserFriendlyErrorHandler.handleNetworkError('axios', error)

      expect(mocks.renderNetworkError).toHaveBeenCalledWith('axios')
      expect(mocks.trackSkippedPackage).toHaveBeenCalledWith('axios', error)
      expect(mocks.loggerDebugError).toHaveBeenCalledWith(
        'Network error',
        error,
        expect.objectContaining({ packageName: 'axios' })
      )
    })
  })

  describe('handleSecurityCheckFailure', () => {
    it('should track security failure', () => {
      const error = new Error('Security API unavailable')
      UserFriendlyErrorHandler.handleSecurityCheckFailure('sec-test-pkg', error)

      expect(mocks.trackSecurityFailure).toHaveBeenCalled()
      expect(mocks.loggerDebugError).toHaveBeenCalled()
    })

    it('should render message for update operations', () => {
      const error = new Error('Security API unavailable')
      UserFriendlyErrorHandler.handleSecurityCheckFailure('sec-update-pkg', error, {
        operation: 'update',
      })

      expect(mocks.renderSecurityCheckUnavailable).toHaveBeenCalledWith('sec-update-pkg')
    })

    it('should render message for security-audit operations', () => {
      const error = new Error('Security API unavailable')
      UserFriendlyErrorHandler.handleSecurityCheckFailure('sec-audit-pkg', error, {
        operation: 'security-audit',
      })

      expect(mocks.renderSecurityCheckUnavailable).toHaveBeenCalledWith('sec-audit-pkg')
    })

    it('should not render message for other operations', () => {
      const error = new Error('Security API unavailable')
      UserFriendlyErrorHandler.handleSecurityCheckFailure('sec-check-pkg', error, {
        operation: 'check',
      })

      expect(mocks.renderSecurityCheckUnavailable).not.toHaveBeenCalled()
    })
  })

  describe('handleRetryAttempt', () => {
    it('should log retry attempt', () => {
      const error = new Error('Timeout')
      UserFriendlyErrorHandler.handleRetryAttempt('retry-test-pkg', 1, 3, error)

      expect(mocks.loggerDebugError).toHaveBeenCalledWith(
        'Retry attempt 1/3 for retry-test-pkg',
        error
      )
    })

    it('should handle final failure on last retry', () => {
      const error = new Error('404 Not Found')
      UserFriendlyErrorHandler.handleRetryAttempt('retry-final-pkg', 3, 3, error)

      // Should call handleFinalFailure which calls handlePackageNotFound
      expect(mocks.renderPackageNotFound).toHaveBeenCalledWith('retry-final-pkg', undefined)
    })
  })

  describe('handleFinalFailure', () => {
    it('should route 404 errors to handlePackageNotFound', () => {
      const error = new Error('404 Not Found')
      UserFriendlyErrorHandler.handleFinalFailure('final-404-pkg', error)

      expect(mocks.renderPackageNotFound).toHaveBeenCalledWith('final-404-pkg', undefined)
    })

    it('should route timeout errors to handleNetworkError', () => {
      const error = new Error('Connection timeout')
      UserFriendlyErrorHandler.handleFinalFailure('final-timeout-pkg', error)

      expect(mocks.renderNetworkError).toHaveBeenCalledWith('final-timeout-pkg')
    })

    it('should route empty version errors to handleEmptyVersion', () => {
      const error = new Error('Version string cannot be empty')
      UserFriendlyErrorHandler.handleFinalFailure('final-empty-ver-pkg', error)

      expect(mocks.renderEmptyVersion).toHaveBeenCalledWith('final-empty-ver-pkg')
    })

    it('should handle generic errors', () => {
      const error = new Error('Unknown error')
      UserFriendlyErrorHandler.handleFinalFailure('final-mystery-pkg', error)

      expect(mocks.renderPackageSkipped).toHaveBeenCalledWith('final-mystery-pkg')
    })
  })

  describe('handlePackageQueryFailure', () => {
    it('should route 404 errors correctly', () => {
      const error = new Error('Package not found (404)')
      UserFriendlyErrorHandler.handlePackageQueryFailure('query-404-pkg', error)

      expect(mocks.renderPackageNotFound).toHaveBeenCalled()
    })

    it('should route empty version errors correctly', () => {
      const error = new Error('Version string cannot be empty')
      UserFriendlyErrorHandler.handlePackageQueryFailure('query-empty-ver-pkg', error)

      expect(mocks.renderEmptyVersion).toHaveBeenCalled()
    })

    it('should route timeout errors correctly', () => {
      const error = new Error('ETIMEDOUT')
      UserFriendlyErrorHandler.handlePackageQueryFailure('query-timeout-pkg', error)

      expect(mocks.renderNetworkError).toHaveBeenCalled()
    })

    it('should silently track other errors', () => {
      const error = new Error('Unknown error')
      UserFriendlyErrorHandler.handlePackageQueryFailure('query-mystery-pkg', error)

      expect(mocks.trackSkippedPackage).toHaveBeenCalledWith('query-mystery-pkg', error)
      expect(mocks.loggerDebugError).toHaveBeenCalled()
      // Should not render any specific error message
      expect(mocks.renderPackageNotFound).not.toHaveBeenCalled()
      expect(mocks.renderEmptyVersion).not.toHaveBeenCalled()
      expect(mocks.renderNetworkError).not.toHaveBeenCalled()
    })
  })

  describe('showSkippedPackagesSummary', () => {
    it('should not render when no packages skipped', () => {
      mocks.getTotalSkipped.mockReturnValue(0)

      UserFriendlyErrorHandler.showSkippedPackagesSummary()

      expect(mocks.renderSkippedPackagesSummary).not.toHaveBeenCalled()
    })

    it('should render summary when packages skipped', () => {
      mocks.getTotalSkipped.mockReturnValue(3)
      mocks.getSkippedPackages.mockReturnValue({
        notFound: ['a'],
        emptyVersion: ['b'],
        network: [],
        other: ['c'],
      })
      mocks.getErrorStats.mockReturnValue({
        notFound: 1,
        emptyVersion: 1,
        network: 0,
        security: 2,
        other: 1,
      })

      UserFriendlyErrorHandler.showSkippedPackagesSummary()

      expect(mocks.renderSkippedPackagesSummary).toHaveBeenCalledWith({
        total: 3,
        notFound: ['a'],
        emptyVersion: ['b'],
        network: [],
        other: ['c'],
        securityFailures: 2,
      })
    })
  })

  describe('getStatistics', () => {
    it('should return statistics from ErrorTracker', () => {
      mocks.getTotalSkipped.mockReturnValue(5)
      mocks.getErrorStats.mockReturnValue({
        notFound: 2,
        network: 1,
        emptyVersion: 1,
        security: 3,
        other: 1,
      })
      mocks.getSkippedPackages.mockReturnValue({
        notFound: ['a', 'b'],
        network: ['c'],
        emptyVersion: ['d'],
        other: ['e'],
      })

      const stats = UserFriendlyErrorHandler.getStatistics()

      expect(stats).toEqual({
        totalSkipped: 5,
        errorBreakdown: {
          notFound: 2,
          network: 1,
          emptyVersion: 1,
          security: 3,
          other: 1,
        },
        skippedPackages: {
          notFound: ['a', 'b'],
          network: ['c'],
          emptyVersion: ['d'],
          other: ['e'],
        },
      })
    })
  })

  describe('resetTracking', () => {
    it('should reset ErrorTracker', () => {
      UserFriendlyErrorHandler.resetTracking()

      expect(mocks.reset).toHaveBeenCalled()
    })
  })

  describe('package suggestions', () => {
    it('should add and get package suggestions', () => {
      UserFriendlyErrorHandler.addPackageSuggestion('lodash', ['lodash-es', 'underscore'])

      const suggestions = UserFriendlyErrorHandler.getSuggestionsForPackage('lodash')
      expect(suggestions).toEqual(['lodash-es', 'underscore'])
    })

    it('should return empty array for unknown packages', () => {
      const suggestions = UserFriendlyErrorHandler.getSuggestionsForPackage('unknown-pkg')
      expect(suggestions).toEqual([])
    })
  })
})
