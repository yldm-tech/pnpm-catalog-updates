/**
 * Analysis Cache Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisContext, AnalysisResult } from '../../../../domain/interfaces/aiProvider.js'

// Use vi.hoisted to ensure mocks are available during vi.mock hoisting
const mocks = vi.hoisted(() => {
  const mockHash = {
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue('abc123'),
  }

  return {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
    // Async fs mocks for non-blocking initialization and PERF-002 async disk operations
    fsAccess: vi.fn().mockRejectedValue(new Error('ENOENT')),
    fsReadFile: vi.fn().mockResolvedValue('{}'),
    fsMkdir: vi.fn().mockResolvedValue(undefined),
    fsWriteFile: vi.fn().mockResolvedValue(undefined),
    fsUnlink: vi.fn().mockResolvedValue(undefined),
    fsRm: vi.fn().mockResolvedValue(undefined),
    homedir: vi.fn().mockReturnValue('/home/user'),
    createHash: vi.fn().mockReturnValue(mockHash),
    mockHash,
  }
})

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  mkdirSync: mocks.mkdirSync,
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  unlinkSync: mocks.unlinkSync,
  rmSync: mocks.rmSync,
  // Async fs promises (PERF-002: async disk operations)
  promises: {
    access: mocks.fsAccess,
    readFile: mocks.fsReadFile,
    mkdir: mocks.fsMkdir,
    writeFile: mocks.fsWriteFile,
    unlink: mocks.fsUnlink,
    rm: mocks.fsRm,
  },
}))

// Mock node:os
vi.mock('node:os', () => ({
  homedir: mocks.homedir,
}))

// Mock node:crypto
vi.mock('node:crypto', () => ({
  createHash: mocks.createHash,
}))

// Import after mocks
const { AnalysisCache } = await import('../analysisCache.js')

describe('AnalysisCache', () => {
  let cache: InstanceType<typeof AnalysisCache>

  const createMockContext = (overrides: Partial<AnalysisContext> = {}): AnalysisContext => ({
    analysisType: 'impact',
    packages: [
      {
        name: 'lodash',
        currentVersion: '4.17.20',
        targetVersion: '4.17.21',
        dependencyType: 'dependencies',
        catalogName: 'default',
      },
    ],
    workspaceInfo: {
      name: 'test-workspace',
      path: '/test/workspace',
      isValid: true,
      hasPackages: true,
      hasCatalogs: true,
      packageCount: 5,
      catalogCount: 1,
      catalogNames: ['default'],
    },
    options: {},
    ...overrides,
  })

  const createMockResult = (overrides: Partial<AnalysisResult> = {}): AnalysisResult => ({
    summary: 'Test analysis summary',
    confidence: 0.85,
    provider: 'test-provider',
    analysisType: 'impact',
    recommendations: [
      {
        package: 'lodash',
        action: 'update',
        priority: 'medium',
        reason: 'Patch update with bug fixes',
        currentVersion: '4.17.20',
        targetVersion: '4.17.21',
        riskLevel: 'low',
      },
    ],
    risks: [],
    timestamp: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(Date, 'now').mockReturnValue(1000000)

    mocks.homedir.mockReturnValue('/home/user')
    mocks.existsSync.mockReturnValue(false)

    // Reset hash mock
    mocks.mockHash.update.mockReturnThis()
    mocks.mockHash.digest.mockReturnValue('abc123')
    mocks.createHash.mockReturnValue(mocks.mockHash)

    cache = new AnalysisCache({ persistToDisk: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create cache with default options', () => {
      const cache = new AnalysisCache({ persistToDisk: false })
      expect(cache).toBeDefined()
    })

    it('should create cache with custom options', () => {
      const cache = new AnalysisCache({
        ttl: 5000,
        maxEntries: 10,
        persistToDisk: false,
      })
      expect(cache).toBeDefined()
    })

    it('should load from disk when persistToDisk is true', async () => {
      // Now uses async initialization
      mocks.fsAccess.mockResolvedValue(undefined)
      mocks.fsReadFile.mockResolvedValue(JSON.stringify({ keys: [] }))

      const cache = new AnalysisCache({ persistToDisk: true })
      await cache.initialize()

      expect(mocks.fsAccess).toHaveBeenCalled()
    })
  })

  describe('get', () => {
    it('should return undefined for non-existent entry', () => {
      const context = createMockContext()

      const result = cache.get(context, 'test-provider')

      expect(result).toBeUndefined()
    })

    it('should return cached result', () => {
      const context = createMockContext()
      const analysisResult = createMockResult()

      cache.set(context, 'test-provider', analysisResult)
      const result = cache.get(context, 'test-provider')

      expect(result).toBeDefined()
      expect(result?.summary).toBe('Test analysis summary')
    })

    it('should return undefined for expired entry', () => {
      const context = createMockContext()
      const analysisResult = createMockResult()

      cache.set(context, 'test-provider', analysisResult, 1000)

      // Advance time past TTL
      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 2000)

      const result = cache.get(context, 'test-provider')

      expect(result).toBeUndefined()
    })

    it('should return undefined when context hash changes', () => {
      const context1 = createMockContext()
      const analysisResult = createMockResult()

      cache.set(context1, 'test-provider', analysisResult)

      // Modify context hash by changing the mock digest
      mocks.mockHash.digest.mockReturnValue('different-hash')

      const result = cache.get(context1, 'test-provider')

      expect(result).toBeUndefined()
    })

    it('should track cache misses', () => {
      const context = createMockContext()

      cache.get(context, 'provider1')
      cache.get(context, 'provider2')

      const stats = cache.getStats()

      expect(stats.misses).toBe(2)
    })

    it('should track cache hits', () => {
      const context = createMockContext()
      const analysisResult = createMockResult()

      cache.set(context, 'test-provider', analysisResult)
      cache.get(context, 'test-provider')
      cache.get(context, 'test-provider')

      const stats = cache.getStats()

      expect(stats.hits).toBe(2)
    })
  })

  describe('set', () => {
    it('should store result in cache', () => {
      const context = createMockContext()
      const analysisResult = createMockResult()

      cache.set(context, 'test-provider', analysisResult)

      expect(cache.has(context, 'test-provider')).toBe(true)
    })

    it('should use custom TTL when provided', () => {
      const context = createMockContext()
      const analysisResult = createMockResult()

      cache.set(context, 'test-provider', analysisResult, 500)

      // Advance time past custom TTL
      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 600)

      expect(cache.get(context, 'test-provider')).toBeUndefined()
    })

    it('should cache different providers separately', () => {
      const context = createMockContext()
      const result1 = createMockResult({ provider: 'provider1', summary: 'Summary 1' })
      const result2 = createMockResult({ provider: 'provider2', summary: 'Summary 2' })

      // Use different hash values for different providers
      let callCount = 0
      mocks.mockHash.digest.mockImplementation(() => {
        callCount++
        return `hash${callCount}`
      })

      cache.set(context, 'provider1', result1)
      cache.set(context, 'provider2', result2)

      expect(cache.getStats().totalEntries).toBe(2)
    })

    it('should persist to disk when enabled', async () => {
      mocks.existsSync.mockReturnValue(false)

      const cacheWithDisk = new AnalysisCache({ persistToDisk: true })
      const context = createMockContext()
      const analysisResult = createMockResult()

      cacheWithDisk.set(context, 'test-provider', analysisResult)

      // PERF-002: Disk operations are now async fire-and-forget
      await vi.waitFor(() => {
        expect(mocks.fsWriteFile).toHaveBeenCalled()
      })
    })

    it('should evict oldest entry when max entries reached', () => {
      const smallCache = new AnalysisCache({ maxEntries: 2, persistToDisk: false })

      // Use different hashes for different entries
      let hashCounter = 0
      mocks.mockHash.digest.mockImplementation(() => `hash${hashCounter++}`)

      const context1 = createMockContext({
        packages: [{ ...createMockContext().packages[0], name: 'pkg1' }],
      })
      const context2 = createMockContext({
        packages: [{ ...createMockContext().packages[0], name: 'pkg2' }],
      })
      const context3 = createMockContext({
        packages: [{ ...createMockContext().packages[0], name: 'pkg3' }],
      })

      smallCache.set(context1, 'provider', createMockResult())
      vi.spyOn(Date, 'now').mockReturnValue(1000001)
      smallCache.set(context2, 'provider', createMockResult())
      vi.spyOn(Date, 'now').mockReturnValue(1000002)
      smallCache.set(context3, 'provider', createMockResult())

      // Oldest entry should be evicted
      const stats = smallCache.getStats()
      expect(stats.totalEntries).toBeLessThanOrEqual(2)
    })
  })

  describe('has', () => {
    it('should return false for non-existent entry', () => {
      const context = createMockContext()

      expect(cache.has(context, 'test-provider')).toBe(false)
    })

    it('should return true for existing entry', () => {
      const context = createMockContext()
      const analysisResult = createMockResult()

      cache.set(context, 'test-provider', analysisResult)

      expect(cache.has(context, 'test-provider')).toBe(true)
    })

    it('should return false for expired entry', () => {
      const context = createMockContext()
      const analysisResult = createMockResult()

      cache.set(context, 'test-provider', analysisResult, 1000)

      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 2000)

      expect(cache.has(context, 'test-provider')).toBe(false)
    })
  })

  describe('invalidateForPackages', () => {
    it('should remove entries for specified packages', () => {
      const context1 = createMockContext({
        packages: [{ ...createMockContext().packages[0], name: 'lodash' }],
      })
      const context2 = createMockContext({
        packages: [{ ...createMockContext().packages[0], name: 'react' }],
      })

      // Use different hashes
      let hashCounter = 0
      mocks.mockHash.digest.mockImplementation(() => `hash${hashCounter++}`)

      const result1 = createMockResult({
        recommendations: [{ ...createMockResult().recommendations[0], package: 'lodash' }],
      })
      const result2 = createMockResult({
        recommendations: [{ ...createMockResult().recommendations[0], package: 'react' }],
      })

      cache.set(context1, 'provider', result1)
      cache.set(context2, 'provider', result2)

      cache.invalidateForPackages(['lodash'])

      const stats = cache.getStats()
      expect(stats.totalEntries).toBe(1)
    })

    it('should not remove unrelated entries', () => {
      const context = createMockContext()
      const result = createMockResult({
        recommendations: [{ ...createMockResult().recommendations[0], package: 'react' }],
      })

      cache.set(context, 'provider', result)

      cache.invalidateForPackages(['vue'])

      const stats = cache.getStats()
      expect(stats.totalEntries).toBe(1)
    })
  })

  describe('clear', () => {
    it('should remove all entries', () => {
      const context1 = createMockContext()
      const context2 = createMockContext({ analysisType: 'security' })

      // Use different hashes
      let hashCounter = 0
      mocks.mockHash.digest.mockImplementation(() => `hash${hashCounter++}`)

      cache.set(context1, 'provider1', createMockResult())
      cache.set(context2, 'provider2', createMockResult())

      cache.clear()

      const stats = cache.getStats()
      expect(stats.totalEntries).toBe(0)
    })

    it('should reset statistics', () => {
      const context = createMockContext()
      const result = createMockResult()

      cache.set(context, 'provider', result)
      cache.get(context, 'provider')
      cache.get(createMockContext({ analysisType: 'security' }), 'provider')

      cache.clear()
      const stats = cache.getStats()

      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const context = createMockContext()
      const result = createMockResult()

      cache.set(context, 'provider', result)
      cache.get(context, 'provider') // hit
      cache.get(context, 'provider') // hit

      // Use different hash for the miss case
      mocks.mockHash.digest.mockReturnValue('different-key-hash')
      cache.get(createMockContext({ analysisType: 'security' }), 'provider') // miss

      const stats = cache.getStats()

      expect(stats.totalEntries).toBe(1)
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(0.667, 2)
    })

    it('should handle zero total requests', () => {
      const stats = cache.getStats()

      expect(stats.hitRate).toBe(0)
    })

    it('should track oldest and newest entry timestamps', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000000)

      const context1 = createMockContext()

      // Use different hashes
      let hashCounter = 0
      mocks.mockHash.digest.mockImplementation(() => `hash${hashCounter++}`)

      cache.set(context1, 'provider', createMockResult())

      vi.spyOn(Date, 'now').mockReturnValue(2000000)
      const context2 = createMockContext({ analysisType: 'security' })
      cache.set(context2, 'provider', createMockResult())

      const stats = cache.getStats()

      expect(stats.oldestEntry).toBe(1000000)
      expect(stats.newestEntry).toBe(2000000)
    })
  })

  describe('TTL by analysis type', () => {
    it('should use shorter TTL for security analysis', () => {
      const context = createMockContext({ analysisType: 'security' })
      const result = createMockResult()

      cache.set(context, 'provider', result)

      // Advance time past security TTL (30 minutes) but before default TTL (1 hour)
      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 35 * 60 * 1000)

      expect(cache.get(context, 'provider')).toBeUndefined()
    })

    it('should use longer TTL for compatibility analysis', () => {
      const context = createMockContext({ analysisType: 'compatibility' })
      const result = createMockResult()

      cache.set(context, 'provider', result)

      // Advance time past default TTL (1 hour) but before compatibility TTL (2 hours)
      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 90 * 60 * 1000)

      expect(cache.get(context, 'provider')).toBeDefined()
    })
  })

  describe('disk persistence', () => {
    it('should load entries from disk on initialization', async () => {
      vi.clearAllMocks()
      // Now uses async initialization
      mocks.fsAccess.mockResolvedValue(undefined)
      mocks.fsReadFile.mockImplementation((path: string) => {
        if (path.includes('index.json')) {
          return Promise.resolve(JSON.stringify({ keys: ['key1'] }))
        }
        return Promise.resolve(
          JSON.stringify({
            key: 'key1',
            result: createMockResult(),
            timestamp: 1000000,
            ttl: 3600000,
            contextHash: 'hash123',
          })
        )
      })

      const cache = new AnalysisCache({ persistToDisk: true })
      await cache.initialize()

      expect(mocks.fsAccess).toHaveBeenCalled()
      expect(mocks.fsReadFile).toHaveBeenCalled()
    })

    it('should create cache directory if not exists', async () => {
      mocks.existsSync.mockReturnValue(false)

      const cacheWithDisk = new AnalysisCache({ persistToDisk: true })
      const context = createMockContext()

      cacheWithDisk.set(context, 'provider', createMockResult())

      // PERF-002: Disk operations are now async fire-and-forget
      await vi.waitFor(() => {
        expect(mocks.fsMkdir).toHaveBeenCalledWith(expect.stringContaining('.pcu'), {
          recursive: true,
        })
      })
    })

    it('should update disk index when saving', async () => {
      mocks.existsSync.mockReturnValue(false)

      const cacheWithDisk = new AnalysisCache({ persistToDisk: true })
      const context = createMockContext()

      cacheWithDisk.set(context, 'provider', createMockResult())

      // PERF-002: Disk operations are now async fire-and-forget
      // Should write both entry and index
      await vi.waitFor(() => {
        expect(mocks.fsWriteFile).toHaveBeenCalledTimes(2)
      })
    })

    it('should delete from disk when invalidating', async () => {
      mocks.existsSync.mockReturnValue(true)

      const cacheWithDisk = new AnalysisCache({ persistToDisk: true })
      const context = createMockContext()
      const result = createMockResult({
        recommendations: [{ ...createMockResult().recommendations[0], package: 'lodash' }],
      })

      cacheWithDisk.set(context, 'provider', result)

      vi.clearAllMocks()
      cacheWithDisk.invalidateForPackages(['lodash'])

      // PERF-002: Disk operations are now async fire-and-forget
      await vi.waitFor(() => {
        expect(mocks.fsUnlink).toHaveBeenCalled()
      })
    })
  })
})
