/**
 * Error Tracker Tests
 */

import { afterEach, describe, expect, it } from 'vitest'
import { ErrorTracker } from '../errorTracker.js'

describe('ErrorTracker', () => {
  afterEach(() => {
    ErrorTracker.reset()
  })

  describe('trackSkippedPackage', () => {
    it('should track not-found errors (404)', () => {
      const error = new Error('Package lodash 404 Not Found')
      ErrorTracker.trackSkippedPackage('lodash', error)

      const skipped = ErrorTracker.getSkippedPackages()
      expect(skipped.notFound).toEqual(['lodash'])
      expect(ErrorTracker.getErrorStats().notFound).toBe(1)
    })

    it('should track not-found errors (Not found message)', () => {
      const error = new Error('Not found on registry')
      ErrorTracker.trackSkippedPackage('unknown-pkg', error)

      const skipped = ErrorTracker.getSkippedPackages()
      expect(skipped.notFound).toEqual(['unknown-pkg'])
    })

    it('should track empty-version errors', () => {
      const error = new Error('Version string cannot be empty')
      ErrorTracker.trackSkippedPackage('empty-version-pkg', error)

      const skipped = ErrorTracker.getSkippedPackages()
      expect(skipped.emptyVersion).toEqual(['empty-version-pkg'])
      expect(ErrorTracker.getErrorStats().emptyVersion).toBe(1)
    })

    it('should track network timeout errors', () => {
      const error = new Error('Request timeout')
      ErrorTracker.trackSkippedPackage('slow-pkg', error)

      const skipped = ErrorTracker.getSkippedPackages()
      expect(skipped.network).toEqual(['slow-pkg'])
      expect(ErrorTracker.getErrorStats().network).toBe(1)
    })

    it('should track ETIMEDOUT network errors', () => {
      const error = new Error('connect ETIMEDOUT')
      ErrorTracker.trackSkippedPackage('timed-out-pkg', error)

      const skipped = ErrorTracker.getSkippedPackages()
      expect(skipped.network).toEqual(['timed-out-pkg'])
    })

    it('should track other errors', () => {
      const error = new Error('Unknown error occurred')
      ErrorTracker.trackSkippedPackage('mystery-pkg', error)

      const skipped = ErrorTracker.getSkippedPackages()
      expect(skipped.other).toEqual(['mystery-pkg'])
      expect(ErrorTracker.getErrorStats().other).toBe(1)
    })

    it('should track multiple packages with different reasons', () => {
      ErrorTracker.trackSkippedPackage('not-found-1', new Error('404'))
      ErrorTracker.trackSkippedPackage('not-found-2', new Error('Not found'))
      ErrorTracker.trackSkippedPackage('network-1', new Error('timeout'))
      ErrorTracker.trackSkippedPackage('empty-1', new Error('Version string cannot be empty'))
      ErrorTracker.trackSkippedPackage('other-1', new Error('Random error'))

      const skipped = ErrorTracker.getSkippedPackages()
      expect(skipped.notFound).toEqual(['not-found-1', 'not-found-2'])
      expect(skipped.network).toEqual(['network-1'])
      expect(skipped.emptyVersion).toEqual(['empty-1'])
      expect(skipped.other).toEqual(['other-1'])
    })
  })

  describe('trackSecurityFailure', () => {
    it('should increment security error count', () => {
      expect(ErrorTracker.getErrorStats().security).toBe(0)

      ErrorTracker.trackSecurityFailure()
      expect(ErrorTracker.getErrorStats().security).toBe(1)

      ErrorTracker.trackSecurityFailure()
      expect(ErrorTracker.getErrorStats().security).toBe(2)
    })
  })

  describe('getSkippedPackages', () => {
    it('should return empty arrays when no packages tracked', () => {
      const skipped = ErrorTracker.getSkippedPackages()

      expect(skipped.notFound).toEqual([])
      expect(skipped.network).toEqual([])
      expect(skipped.emptyVersion).toEqual([])
      expect(skipped.other).toEqual([])
    })

    it('should return correct groupings', () => {
      ErrorTracker.trackSkippedPackage('a', new Error('404'))
      ErrorTracker.trackSkippedPackage('b', new Error('timeout'))
      ErrorTracker.trackSkippedPackage('c', new Error('Version string cannot be empty'))
      ErrorTracker.trackSkippedPackage('d', new Error('other'))

      const skipped = ErrorTracker.getSkippedPackages()
      expect(skipped).toEqual({
        notFound: ['a'],
        network: ['b'],
        emptyVersion: ['c'],
        other: ['d'],
      })
    })
  })

  describe('getErrorStats', () => {
    it('should return all zero counts initially', () => {
      const stats = ErrorTracker.getErrorStats()

      expect(stats).toEqual({
        notFound: 0,
        network: 0,
        emptyVersion: 0,
        security: 0,
        other: 0,
      })
    })

    it('should return correct counts after tracking', () => {
      ErrorTracker.trackSkippedPackage('a', new Error('404'))
      ErrorTracker.trackSkippedPackage('b', new Error('404'))
      ErrorTracker.trackSkippedPackage('c', new Error('timeout'))
      ErrorTracker.trackSecurityFailure()
      ErrorTracker.trackSecurityFailure()
      ErrorTracker.trackSecurityFailure()

      const stats = ErrorTracker.getErrorStats()
      expect(stats.notFound).toBe(2)
      expect(stats.network).toBe(1)
      expect(stats.security).toBe(3)
    })

    it('should return a copy of counts', () => {
      const stats1 = ErrorTracker.getErrorStats()
      stats1.notFound = 100

      const stats2 = ErrorTracker.getErrorStats()
      expect(stats2.notFound).toBe(0)
    })
  })

  describe('getTotalSkipped', () => {
    it('should return 0 when no packages tracked', () => {
      expect(ErrorTracker.getTotalSkipped()).toBe(0)
    })

    it('should return correct total', () => {
      ErrorTracker.trackSkippedPackage('a', new Error('404'))
      ErrorTracker.trackSkippedPackage('b', new Error('timeout'))
      ErrorTracker.trackSkippedPackage('c', new Error('other'))

      expect(ErrorTracker.getTotalSkipped()).toBe(3)
    })
  })

  describe('reset', () => {
    it('should clear all tracked packages', () => {
      ErrorTracker.trackSkippedPackage('a', new Error('404'))
      ErrorTracker.trackSkippedPackage('b', new Error('timeout'))
      ErrorTracker.trackSecurityFailure()

      expect(ErrorTracker.getTotalSkipped()).toBe(2)
      expect(ErrorTracker.getErrorStats().security).toBe(1)

      ErrorTracker.reset()

      expect(ErrorTracker.getTotalSkipped()).toBe(0)
      expect(ErrorTracker.getErrorStats()).toEqual({
        notFound: 0,
        network: 0,
        emptyVersion: 0,
        security: 0,
        other: 0,
      })
    })
  })

  describe('getAllSkippedPackages', () => {
    it('should return empty array when no packages tracked', () => {
      expect(ErrorTracker.getAllSkippedPackages()).toEqual([])
    })

    it('should return all skipped packages with details', () => {
      ErrorTracker.trackSkippedPackage('lodash', new Error('Package lodash 404'))
      ErrorTracker.trackSkippedPackage('axios', new Error('Connection timeout'))

      const all = ErrorTracker.getAllSkippedPackages()
      expect(all).toHaveLength(2)

      expect(all[0]).toEqual({
        name: 'lodash',
        reason: 'not-found',
        originalError: 'Package lodash 404',
      })

      expect(all[1]).toEqual({
        name: 'axios',
        reason: 'network',
        originalError: 'Connection timeout',
      })
    })

    it('should return a copy of the array', () => {
      ErrorTracker.trackSkippedPackage('lodash', new Error('404'))

      const all1 = ErrorTracker.getAllSkippedPackages()
      all1.push({ name: 'fake', reason: 'other' })

      const all2 = ErrorTracker.getAllSkippedPackages()
      expect(all2).toHaveLength(1)
    })
  })

  describe('error message detection priority', () => {
    it('should prioritize 404 over other matches', () => {
      const error = new Error('404 timeout Not found')
      ErrorTracker.trackSkippedPackage('pkg', error)

      const skipped = ErrorTracker.getSkippedPackages()
      expect(skipped.notFound).toContain('pkg')
      expect(skipped.network).not.toContain('pkg')
    })

    it('should prioritize empty-version over network', () => {
      const error = new Error('Version string cannot be empty timeout')
      ErrorTracker.trackSkippedPackage('pkg', error)

      // Due to the order of checks, 404/Not found is checked first,
      // then empty-version, then timeout
      const skipped = ErrorTracker.getSkippedPackages()
      expect(skipped.emptyVersion).toContain('pkg')
    })
  })
})
