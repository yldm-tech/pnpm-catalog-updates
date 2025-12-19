/**
 * Analysis Cache Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisContext, AnalysisResult } from '../../../domain/interfaces/aiProvider.js'
import { AnalysisCache } from '../cache/analysisCache.js'

// Mock fs for disk cache
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
}))

describe('AnalysisCache', () => {
  let cache: AnalysisCache

  const createContext = (packageNames: string[] = ['lodash']): AnalysisContext => ({
    packages: packageNames.map((name) => ({
      name,
      currentVersion: '1.0.0',
      targetVersion: '1.1.0',
      updateType: 'minor' as const,
    })),
    workspaceInfo: {
      name: 'test-workspace',
      path: '/test/path',
      packageCount: 5,
      catalogCount: 1,
    },
    analysisType: 'impact',
  })

  const createResult = (provider = 'test-provider', packageName = 'lodash'): AnalysisResult => ({
    provider,
    analysisType: 'impact',
    recommendations: [
      {
        package: packageName,
        currentVersion: '1.0.0',
        targetVersion: '1.1.0',
        action: 'update',
        reason: 'Safe minor update',
        riskLevel: 'low',
      },
    ],
    summary: 'Test analysis result',
    confidence: 0.9,
    timestamp: new Date(),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    cache = new AnalysisCache({ ttl: 3600000, persistToDisk: false })
  })

  afterEach(() => {
    cache.clear()
  })

  describe('set and get', () => {
    it('should store and retrieve cached result', () => {
      const context = createContext()
      const result = createResult()

      cache.set(context, 'claude', result)
      const cached = cache.get(context, 'claude')

      expect(cached).toBeDefined()
      expect(cached?.provider).toBe('test-provider')
    })

    it('should return undefined for non-existent cache entry', () => {
      const context = createContext()
      const cached = cache.get(context, 'claude')

      expect(cached).toBeUndefined()
    })

    it('should cache by provider', () => {
      const context = createContext()
      const result1 = createResult('claude')
      const result2 = createResult('gemini')

      cache.set(context, 'claude', result1)
      cache.set(context, 'gemini', result2)

      const cachedClaude = cache.get(context, 'claude')
      const cachedGemini = cache.get(context, 'gemini')

      expect(cachedClaude?.provider).toBe('claude')
      expect(cachedGemini?.provider).toBe('gemini')
    })

    it('should differentiate by analysis type', () => {
      const context1 = createContext()
      const context2 = { ...createContext(), analysisType: 'security' as const }

      cache.set(context1, 'claude', createResult())

      const cached1 = cache.get(context1, 'claude')
      const cached2 = cache.get(context2, 'claude')

      expect(cached1).toBeDefined()
      expect(cached2).toBeUndefined()
    })
  })

  describe('invalidateForPackages', () => {
    it('should invalidate cache entries containing specified packages', () => {
      const context = createContext(['lodash', 'axios'])
      const result = createResult()

      cache.set(context, 'claude', result)
      expect(cache.get(context, 'claude')).toBeDefined()

      cache.invalidateForPackages(['lodash'])
      expect(cache.get(context, 'claude')).toBeUndefined()
    })

    it('should not invalidate entries without specified packages', () => {
      const context1 = createContext(['lodash'])
      const context2 = createContext(['axios'])

      cache.set(context1, 'claude', createResult('test-provider', 'lodash'))
      cache.set(context2, 'claude', createResult('test-provider', 'axios'))

      cache.invalidateForPackages(['lodash'])

      expect(cache.get(context1, 'claude')).toBeUndefined()
      expect(cache.get(context2, 'claude')).toBeDefined()
    })
  })

  describe('clear', () => {
    it('should clear all cache entries', () => {
      const context1 = createContext(['lodash'])
      const context2 = createContext(['axios'])

      cache.set(context1, 'claude', createResult())
      cache.set(context2, 'gemini', createResult())

      cache.clear()

      expect(cache.get(context1, 'claude')).toBeUndefined()
      expect(cache.get(context2, 'gemini')).toBeUndefined()
    })
  })

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const context = createContext()
      cache.set(context, 'claude', createResult())

      const stats = cache.getStats()

      expect(stats.totalEntries).toBe(1)
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })

    it('should track hits', () => {
      const context = createContext()
      cache.set(context, 'claude', createResult())

      cache.get(context, 'claude')
      cache.get(context, 'claude')

      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
    })

    it('should track misses', () => {
      const context = createContext()

      cache.get(context, 'claude')
      cache.get(context, 'gemini')

      const stats = cache.getStats()
      expect(stats.misses).toBe(2)
    })

    it('should calculate hit rate', () => {
      const context = createContext()
      cache.set(context, 'claude', createResult())

      cache.get(context, 'claude') // hit
      cache.get(context, 'claude') // hit
      cache.get(context, 'gemini') // miss

      const stats = cache.getStats()
      expect(stats.hitRate).toBeCloseTo(0.667, 2)
    })
  })

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      // Create cache with disk persistence disabled
      const shortTtlCache = new AnalysisCache({ ttl: 1, persistToDisk: false })
      const context = createContext()

      // Set with very short TTL (1ms)
      shortTtlCache.set(context, 'claude', createResult(), 1)

      // Wait for TTL to expire
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          const cached = shortTtlCache.get(context, 'claude')
          expect(cached).toBeUndefined()
          shortTtlCache.clear()
          resolve()
        }, 10)
      })
    })
  })
})
