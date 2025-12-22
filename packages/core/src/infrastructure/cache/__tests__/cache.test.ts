/**
 * Cache System Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
const { Cache, RegistryCache, WorkspaceCache } = await import('../cache.js')

describe('Cache', () => {
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
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create cache with default options', () => {
      const cache = new Cache('test')

      expect(cache).toBeDefined()
    })

    it('should create cache with custom options', () => {
      const cache = new Cache('test', {
        ttl: 5000,
        maxSize: 1024,
        maxEntries: 10,
        persistToDisk: false,
      })

      expect(cache).toBeDefined()
    })

    it('should load from disk when persistToDisk is true', () => {
      mocks.existsSync.mockReturnValue(true)
      mocks.readFileSync.mockReturnValue(JSON.stringify({ keys: [] }))

      new Cache('test', { persistToDisk: true })

      expect(mocks.existsSync).toHaveBeenCalled()
    })
  })

  describe('get', () => {
    it('should return undefined for non-existent key', () => {
      const cache = new Cache<string>('test')

      const result = cache.get('nonexistent')

      expect(result).toBeUndefined()
    })

    it('should return cached value', () => {
      const cache = new Cache<string>('test')
      cache.set('key1', 'value1')

      const result = cache.get('key1')

      expect(result).toBe('value1')
    })

    it('should return undefined for expired entry', () => {
      const cache = new Cache<string>('test', { ttl: 1000 })
      cache.set('key1', 'value1')

      // Advance time past TTL
      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 2000)

      const result = cache.get('key1')

      expect(result).toBeUndefined()
    })

    it('should track cache misses', () => {
      const cache = new Cache<string>('test')
      cache.get('miss1')
      cache.get('miss2')

      const stats = cache.getStats()

      expect(stats.misses).toBe(2)
    })

    it('should track cache hits', () => {
      const cache = new Cache<string>('test')
      cache.set('key1', 'value1')
      cache.get('key1')
      cache.get('key1')

      const stats = cache.getStats()

      expect(stats.hits).toBe(2)
    })
  })

  describe('set', () => {
    it('should store value in cache', () => {
      const cache = new Cache<string>('test')

      cache.set('key1', 'value1')

      expect(cache.get('key1')).toBe('value1')
    })

    it('should use custom TTL when provided', () => {
      const cache = new Cache<string>('test', { ttl: 10000 })
      cache.set('key1', 'value1', 500)

      // Advance time past custom TTL but before default TTL
      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 600)

      expect(cache.get('key1')).toBeUndefined()
    })

    it('should overwrite existing entry', () => {
      const cache = new Cache<string>('test')
      cache.set('key1', 'value1')
      cache.set('key1', 'value2')

      expect(cache.get('key1')).toBe('value2')
    })

    it('should persist to disk when enabled', () => {
      mocks.existsSync.mockReturnValue(false)

      const cache = new Cache<string>('test', { persistToDisk: true })
      cache.set('key1', 'value1')

      expect(mocks.writeFileSync).toHaveBeenCalled()
    })

    it('should evict oldest entry when max entries reached', () => {
      const cache = new Cache<string>('test', { maxEntries: 2 })

      cache.set('key1', 'value1')
      vi.spyOn(Date, 'now').mockReturnValue(1000001)
      cache.set('key2', 'value2')
      vi.spyOn(Date, 'now').mockReturnValue(1000002)
      cache.set('key3', 'value3')

      // key1 should be evicted as it's the oldest
      expect(cache.get('key1')).toBeUndefined()
      expect(cache.get('key2')).toBe('value2')
      expect(cache.get('key3')).toBe('value3')
    })
  })

  describe('has', () => {
    it('should return false for non-existent key', () => {
      const cache = new Cache<string>('test')

      expect(cache.has('nonexistent')).toBe(false)
    })

    it('should return true for existing key', () => {
      const cache = new Cache<string>('test')
      cache.set('key1', 'value1')

      expect(cache.has('key1')).toBe(true)
    })

    it('should return false for expired key', () => {
      const cache = new Cache<string>('test', { ttl: 1000 })
      cache.set('key1', 'value1')

      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 2000)

      expect(cache.has('key1')).toBe(false)
    })
  })

  describe('delete', () => {
    it('should remove entry from cache', () => {
      const cache = new Cache<string>('test')
      cache.set('key1', 'value1')

      const result = cache.delete('key1')

      expect(result).toBe(true)
      expect(cache.get('key1')).toBeUndefined()
    })

    it('should return false for non-existent key', () => {
      const cache = new Cache<string>('test')

      const result = cache.delete('nonexistent')

      expect(result).toBe(false)
    })

    it('should delete from disk when enabled', () => {
      mocks.existsSync.mockReturnValue(true)

      const cache = new Cache<string>('test', { persistToDisk: true })
      cache.set('key1', 'value1')

      vi.clearAllMocks()
      cache.delete('key1')

      expect(mocks.unlinkSync).toHaveBeenCalled()
    })
  })

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new Cache<string>('test')
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      cache.clear()

      expect(cache.get('key1')).toBeUndefined()
      expect(cache.get('key2')).toBeUndefined()
    })

    it('should reset statistics', () => {
      const cache = new Cache<string>('test')
      cache.set('key1', 'value1')
      cache.get('key1')
      cache.get('miss')

      cache.clear()
      const stats = cache.getStats()

      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const cache = new Cache<string>('test')
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.get('key1') // hit
      cache.get('key2') // hit
      cache.get('miss') // miss

      const stats = cache.getStats()

      expect(stats.totalEntries).toBe(2)
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(0.667, 2)
      expect(stats.missRate).toBeCloseTo(0.333, 2)
    })

    it('should handle zero total requests', () => {
      const cache = new Cache<string>('test')

      const stats = cache.getStats()

      expect(stats.hitRate).toBe(0)
      expect(stats.missRate).toBe(0)
    })
  })

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      const cache = new Cache<string>('test')
      cache.set('key1', 'cached')
      const factory = vi.fn().mockResolvedValue('factory')

      const result = await cache.getOrSet('key1', factory)

      expect(result).toBe('cached')
      expect(factory).not.toHaveBeenCalled()
    })

    it('should call factory and cache result if not exists', async () => {
      const cache = new Cache<string>('test')
      const factory = vi.fn().mockResolvedValue('factory')

      const result = await cache.getOrSet('key1', factory)

      expect(result).toBe('factory')
      expect(factory).toHaveBeenCalled()
      expect(cache.get('key1')).toBe('factory')
    })

    it('should use custom TTL when provided', async () => {
      const cache = new Cache<string>('test', { ttl: 10000 })
      const factory = vi.fn().mockResolvedValue('factory')

      await cache.getOrSet('key1', factory, 500)

      // Advance time past custom TTL
      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 600)

      expect(cache.get('key1')).toBeUndefined()
    })
  })

  describe('disk persistence', () => {
    it('should load entries from disk on initialization', () => {
      // Reset and setup mocks before creating cache
      vi.clearAllMocks()

      const entryData = {
        key: 'key1',
        value: 'value1',
        timestamp: 1000000,
        ttl: 3600000,
        size: 100,
      }

      // Mock existsSync to return true for all paths (cacheDir and files)
      mocks.existsSync.mockReturnValue(true)
      mocks.readFileSync.mockImplementation((path: string) => {
        if (path.includes('index.json')) {
          return JSON.stringify({ keys: ['key1'] })
        }
        return JSON.stringify(entryData)
      })

      new Cache<string>('disktest', { persistToDisk: true })

      // Verify read was attempted for the index file
      expect(mocks.existsSync).toHaveBeenCalled()
      expect(mocks.readFileSync).toHaveBeenCalled()
    })

    it('should create cache directory if not exists', () => {
      mocks.existsSync.mockReturnValue(false)

      const cache = new Cache<string>('test', { persistToDisk: true })
      cache.set('key1', 'value1')

      expect(mocks.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.pcu'), {
        recursive: true,
      })
    })

    it('should update disk index when saving', () => {
      mocks.existsSync.mockReturnValue(false)

      const cache = new Cache<string>('test', { persistToDisk: true })
      cache.set('key1', 'value1')

      // Should write both entry and index
      expect(mocks.writeFileSync).toHaveBeenCalledTimes(2)
    })
  })
})

describe('RegistryCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(Date, 'now').mockReturnValue(1000000)
    mocks.homedir.mockReturnValue('/home/user')
    mocks.existsSync.mockReturnValue(false)

    mocks.mockHash.update.mockReturnThis()
    mocks.mockHash.digest.mockReturnValue('abc123')
    mocks.createHash.mockReturnValue(mocks.mockHash)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('package info caching', () => {
    it('should set and get package info', () => {
      const cache = new RegistryCache({ persistToDisk: false })
      const packageInfo = {
        name: 'lodash',
        versions: ['4.17.20', '4.17.21'],
        latestVersion: '4.17.21',
        tags: { latest: '4.17.21' },
      }

      cache.setPackageInfo('lodash', packageInfo)
      const result = cache.getPackageInfo('lodash')

      expect(result).toEqual(packageInfo)
    })

    it('should return undefined for non-cached package', () => {
      const cache = new RegistryCache({ persistToDisk: false })

      const result = cache.getPackageInfo('unknown-package')

      expect(result).toBeUndefined()
    })
  })

  describe('version caching', () => {
    it('should set and get versions', () => {
      const cache = new RegistryCache({ persistToDisk: false })
      const versions = ['1.0.0', '1.1.0', '2.0.0']

      cache.setVersions('my-package', versions)
      const result = cache.getVersions('my-package')

      expect(result).toEqual(versions)
    })

    it('should return undefined for non-cached versions', () => {
      const cache = new RegistryCache({ persistToDisk: false })

      const result = cache.getVersions('unknown-package')

      expect(result).toBeUndefined()
    })
  })

  describe('security report caching', () => {
    it('should set and get security report', () => {
      const cache = new RegistryCache({ persistToDisk: false })
      const report = {
        package: 'vulnerable-pkg',
        version: '1.0.0',
        vulnerabilities: [
          {
            id: 'CVE-2023-1234',
            title: 'Critical vulnerability',
            severity: 'critical' as const,
            description: 'Test vulnerability',
            reference: 'https://example.com',
            vulnerable_versions: '<2.0.0',
          },
        ],
        hasVulnerabilities: true,
      }

      cache.setSecurityReport('vulnerable-pkg', '1.0.0', report)
      const result = cache.getSecurityReport('vulnerable-pkg', '1.0.0')

      expect(result).toEqual(report)
    })

    it('should return undefined for non-cached report', () => {
      const cache = new RegistryCache({ persistToDisk: false })

      const result = cache.getSecurityReport('unknown', '1.0.0')

      expect(result).toBeUndefined()
    })

    it('should cache different versions separately', () => {
      const cache = new RegistryCache({ persistToDisk: false })
      const reportV1 = {
        package: 'pkg',
        version: '1.0.0',
        vulnerabilities: [],
        hasVulnerabilities: false,
      }
      const reportV2 = {
        package: 'pkg',
        version: '2.0.0',
        vulnerabilities: [
          {
            id: 'CVE-2023-5678',
            title: 'Some vulnerability',
            severity: 'high' as const,
            description: 'Test',
            reference: 'https://example.com',
            vulnerable_versions: '2.x',
          },
        ],
        hasVulnerabilities: true,
      }

      cache.setSecurityReport('pkg', '1.0.0', reportV1)
      cache.setSecurityReport('pkg', '2.0.0', reportV2)

      expect(cache.getSecurityReport('pkg', '1.0.0')).toEqual(reportV1)
      expect(cache.getSecurityReport('pkg', '2.0.0')).toEqual(reportV2)
    })
  })
})

describe('WorkspaceCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(Date, 'now').mockReturnValue(1000000)
    mocks.homedir.mockReturnValue('/home/user')
    mocks.existsSync.mockReturnValue(false)

    mocks.mockHash.update.mockReturnThis()
    mocks.mockHash.digest.mockReturnValue('abc123')
    mocks.createHash.mockReturnValue(mocks.mockHash)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('workspace info caching', () => {
    it('should set and get workspace info', () => {
      const cache = new WorkspaceCache()
      const workspaceInfo = {
        path: '/path/to/workspace',
        name: 'my-workspace',
        packages: ['pkg-a', 'pkg-b'],
        catalogs: {
          default: { lodash: '^4.17.21' },
        },
      }

      cache.setWorkspaceInfo('/path/to/workspace', workspaceInfo)
      const result = cache.getWorkspaceInfo('/path/to/workspace')

      expect(result).toEqual(workspaceInfo)
    })

    it('should return undefined for non-cached workspace', () => {
      const cache = new WorkspaceCache()

      const result = cache.getWorkspaceInfo('/unknown/path')

      expect(result).toBeUndefined()
    })
  })

  describe('package.json caching', () => {
    it('should set and get package.json content', () => {
      const cache = new WorkspaceCache()
      const packageJson = {
        name: 'my-package',
        version: '1.0.0',
        dependencies: {
          lodash: '^4.17.21',
        },
      }

      cache.setPackageJson('/path/to/package.json', packageJson)
      const result = cache.getPackageJson('/path/to/package.json')

      expect(result).toEqual(packageJson)
    })

    it('should return undefined for non-cached package.json', () => {
      const cache = new WorkspaceCache()

      const result = cache.getPackageJson('/unknown/package.json')

      expect(result).toBeUndefined()
    })

    it('should handle complex package.json with all dependency types', () => {
      const cache = new WorkspaceCache()
      const packageJson = {
        name: 'complex-package',
        version: '2.0.0',
        dependencies: {
          lodash: '^4.17.21',
        },
        devDependencies: {
          vitest: '^1.0.0',
        },
        peerDependencies: {
          react: '>=18.0.0',
        },
        optionalDependencies: {
          fsevents: '^2.3.0',
        },
      }

      cache.setPackageJson('/path/to/package.json', packageJson)
      const result = cache.getPackageJson('/path/to/package.json')

      expect(result).toEqual(packageJson)
    })
  })

  describe('TTL behavior', () => {
    it('should use shorter TTL for workspace cache', () => {
      const cache = new WorkspaceCache()
      cache.setWorkspaceInfo('/path', {
        path: '/path',
        name: 'test',
        packages: [],
      })

      // Advance time past default workspace TTL (5 minutes)
      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 6 * 60 * 1000)

      const result = cache.getWorkspaceInfo('/path')

      expect(result).toBeUndefined()
    })
  })
})
