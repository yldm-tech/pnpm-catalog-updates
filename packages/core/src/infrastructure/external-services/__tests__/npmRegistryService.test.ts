/**
 * NPM Registry Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted for mocks that need to be available during hoisting
const mocks = vi.hoisted(() => ({
  packument: vi.fn(),
  manifest: vi.fn(),
  npmFetch: vi.fn(),
  handleRetryAttempt: vi.fn(),
  handleSecurityCheckFailure: vi.fn(),
  handlePackageQueryFailure: vi.fn(),
  npmrcParse: vi.fn(),
  npmrcGetRegistryForPackage: vi.fn(),
  npmrcGetAuthToken: vi.fn(),
  // Cache mocks
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheClear: vi.fn(),
  cacheGetStats: vi.fn(),
}))

// Mock external dependencies
vi.mock('pacote', () => ({
  default: {
    packument: mocks.packument,
    manifest: mocks.manifest,
  },
}))

vi.mock('npm-registry-fetch', () => ({
  default: mocks.npmFetch,
}))

// Mock the shared cache module
vi.mock('../../cache/cache.js', () => ({
  registryCache: {
    get: mocks.cacheGet,
    set: mocks.cacheSet,
    clear: mocks.cacheClear,
    getStats: mocks.cacheGetStats,
  },
}))

// Override UserFriendlyErrorHandler with test mocks
// Note: Other @pcu/utils exports are mocked globally in vitest.setup.ts
vi.mock('@pcu/utils', () => {
  // Recreate necessary error classes for this test
  class InfrastructureError extends Error {
    code: string
    context: Record<string, unknown>
    constructor(message: string, code: string, context: Record<string, unknown> = {}) {
      super(message)
      this.name = 'InfrastructureError'
      this.code = code
      this.context = context
    }
  }

  class RegistryError extends InfrastructureError {
    constructor(
      packageName: string,
      operation: string,
      reason: string,
      statusCode?: number,
      cause?: Error
    ) {
      super(`Registry ${operation} failed for "${packageName}": ${reason}`, 'REGISTRY_ERROR', {
        packageName,
        operation,
        reason,
        statusCode,
      })
      this.name = 'RegistryError'
      this.cause = cause
    }
  }

  class InvalidVersionRangeError extends Error {
    constructor(range: string, reason: string) {
      super(`Invalid version range "${range}": ${reason}`)
      this.name = 'InvalidVersionRangeError'
    }
  }

  return {
    RegistryError,
    InvalidVersionRangeError,
    UserFriendlyErrorHandler: {
      handleRetryAttempt: mocks.handleRetryAttempt,
      handleSecurityCheckFailure: mocks.handleSecurityCheckFailure,
      handlePackageQueryFailure: mocks.handlePackageQueryFailure,
    },
    // Add parallelLimit mock for batchQueryVersions
    parallelLimit: vi.fn(
      async <T, R>(
        items: T[],
        callback: (item: T) => Promise<R>,
        _concurrency?: number
      ): Promise<R[]> => {
        const results: R[] = []
        for (const item of items) {
          results.push(await callback(item))
        }
        return results
      }
    ),
  }
})

vi.mock('../../utils/npmrcParser.js', () => ({
  NpmrcParser: {
    parse: mocks.npmrcParse,
    getRegistryForPackage: mocks.npmrcGetRegistryForPackage,
    getAuthToken: mocks.npmrcGetAuthToken,
  },
}))

// Import after mocks
const { NpmRegistryService } = await import('../npmRegistryService.js')

describe('NpmRegistryService', () => {
  let service: InstanceType<typeof NpmRegistryService>

  const mockPackument = {
    name: 'lodash',
    versions: {
      '4.17.19': {},
      '4.17.20': {},
      '4.17.21': {},
    },
    'dist-tags': {
      latest: '4.17.21',
      next: '4.18.0-beta',
    },
    time: {
      '4.17.19': '2020-01-01T00:00:00.000Z',
      '4.17.20': '2020-06-01T00:00:00.000Z',
      '4.17.21': '2021-01-01T00:00:00.000Z',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock return values
    mocks.npmrcParse.mockReturnValue({
      registry: 'https://registry.npmjs.org/',
      scopedRegistries: {},
      authTokens: {},
    })

    mocks.npmrcGetRegistryForPackage.mockReturnValue('https://registry.npmjs.org/')
    mocks.npmrcGetAuthToken.mockReturnValue(null)

    mocks.packument.mockResolvedValue(mockPackument)

    // Create service instance with caching disabled for predictable tests
    service = new NpmRegistryService('https://registry.npmjs.org/', {
      cacheValidityMinutes: 0, // Disable caching for tests
      retries: 1, // Reduce retries for faster tests
      timeout: 5000,
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getPackageVersions', () => {
    it('should return package versions from registry', async () => {
      const result = await service.getPackageVersions('lodash')

      expect(result).toHaveProperty('name', 'lodash')
      expect(result).toHaveProperty('versions')
      expect(result).toHaveProperty('latestVersion', '4.17.21')
      expect(result).toHaveProperty('tags')
      expect(result.tags).toHaveProperty('latest', '4.17.21')
    })

    it('should call pacote.packument with correct parameters', async () => {
      await service.getPackageVersions('lodash')

      expect(mocks.packument).toHaveBeenCalledWith(
        'lodash',
        expect.objectContaining({
          registry: 'https://registry.npmjs.org/',
          fullMetadata: false,
        })
      )
    })

    it('should sort versions in descending order', async () => {
      const result = await service.getPackageVersions('lodash')

      expect(result.versions[0]).toBe('4.17.21')
      expect(result.versions[1]).toBe('4.17.20')
      expect(result.versions[2]).toBe('4.17.19')
    })

    it('should throw error on network failure', async () => {
      mocks.packument.mockRejectedValue(new Error('Network error'))

      await expect(service.getPackageVersions('lodash')).rejects.toThrow(
        'Fetching package versions for lodash failed after 1 attempts: Network error'
      )
    })
  })

  describe('getLatestVersion', () => {
    it('should return latest version', async () => {
      const result = await service.getLatestVersion('lodash')

      expect(result.toString()).toBe('4.17.21')
    })

    it('should throw error when package not found', async () => {
      mocks.packument.mockRejectedValue(new Error('Package not found'))

      await expect(service.getLatestVersion('nonexistent-package')).rejects.toThrow(
        'Registry getLatestVersion failed for "nonexistent-package"'
      )
    })
  })

  describe('getGreatestVersion', () => {
    it('should return latest version when no range specified', async () => {
      const result = await service.getGreatestVersion('lodash')

      expect(result.toString()).toBe('4.17.21')
    })

    it('should throw error when no versions satisfy range', async () => {
      // Use a range that won't match any versions
      const { VersionRange } = await import('../../../domain/value-objects/version.js')

      // Mock packument with versions that don't satisfy the range
      mocks.packument.mockResolvedValue({
        name: 'lodash',
        versions: {
          '3.0.0': {},
          '3.1.0': {},
        },
        'dist-tags': { latest: '3.1.0' },
      })

      // Create a range that won't match versions 3.x
      await expect(
        service.getGreatestVersion('lodash', VersionRange.fromString('^4.0.0'))
      ).rejects.toThrow('Invalid version range')
    })
  })

  describe('getNewestVersions', () => {
    it('should return versions sorted by publication time', async () => {
      const result = await service.getNewestVersions('lodash', 3)

      expect(result).toHaveLength(3)
      // Most recent first
      expect(result[0]?.toString()).toBe('4.17.21')
    })

    it('should limit results to specified count', async () => {
      const result = await service.getNewestVersions('lodash', 2)

      expect(result).toHaveLength(2)
    })
  })

  describe('checkSecurityVulnerabilities', () => {
    it('should return security report', async () => {
      mocks.npmFetch.mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          advisories: {},
        }),
      })

      const result = await service.checkSecurityVulnerabilities('lodash', '4.17.21')

      expect(result).toHaveProperty('package', 'lodash')
      expect(result).toHaveProperty('version', '4.17.21')
      expect(result).toHaveProperty('vulnerabilities')
      expect(result).toHaveProperty('hasVulnerabilities', false)
    })

    it('should parse vulnerabilities from audit response', async () => {
      mocks.npmFetch.mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          advisories: {
            '1234': {
              id: 1234,
              title: 'Prototype Pollution',
              severity: 'high',
              overview: 'Prototype pollution vulnerability',
              url: 'https://npmjs.com/advisories/1234',
              vulnerable_versions: '<4.17.12',
              patched_versions: '>=4.17.12',
              recommendation: 'Upgrade to version 4.17.12 or later',
            },
          },
        }),
      })

      const result = await service.checkSecurityVulnerabilities('lodash', '4.17.10')

      expect(result.hasVulnerabilities).toBe(true)
      expect(result.vulnerabilities).toHaveLength(1)
      expect(result.vulnerabilities[0]).toMatchObject({
        id: '1234',
        title: 'Prototype Pollution',
        severity: 'high',
      })
    })

    it('should return empty report on audit API failure', async () => {
      mocks.npmFetch.mockRejectedValue(new Error('Audit API unavailable'))

      const result = await service.checkSecurityVulnerabilities('lodash', '4.17.21')

      expect(result.hasVulnerabilities).toBe(false)
      expect(result.vulnerabilities).toHaveLength(0)
      expect(mocks.handleSecurityCheckFailure).toHaveBeenCalled()
    })
  })

  describe('getPackageInfo', () => {
    it('should return full package information', async () => {
      mocks.packument.mockResolvedValue({
        ...mockPackument,
        description: 'Lodash modular utilities',
        homepage: 'https://lodash.com',
        license: 'MIT',
        author: { name: 'John-David Dalton' },
        keywords: ['utility', 'modules'],
      })

      const result = await service.getPackageInfo('lodash')

      expect(result).toHaveProperty('name', 'lodash')
      expect(result).toHaveProperty('description', 'Lodash modular utilities')
      expect(result).toHaveProperty('homepage', 'https://lodash.com')
      expect(result).toHaveProperty('license', 'MIT')
      expect(result).toHaveProperty('versions')
      expect(result).toHaveProperty('latestVersion')
    })
  })

  describe('batchQueryVersions', () => {
    it('should query multiple packages', async () => {
      const packages = ['lodash', 'express', 'react']

      mocks.packument.mockImplementation(async (name: string) => ({
        name,
        versions: { '1.0.0': {} },
        'dist-tags': { latest: '1.0.0' },
      }))

      const result = await service.batchQueryVersions(packages)

      expect(result.size).toBe(3)
      expect(result.has('lodash')).toBe(true)
      expect(result.has('express')).toBe(true)
      expect(result.has('react')).toBe(true)
    })

    it('should call progress callback', async () => {
      const packages = ['lodash', 'express']
      const progressCallback = vi.fn()

      mocks.packument.mockImplementation(async (name: string) => ({
        name,
        versions: { '1.0.0': {} },
        'dist-tags': { latest: '1.0.0' },
      }))

      await service.batchQueryVersions(packages, progressCallback)

      expect(progressCallback).toHaveBeenCalled()
      expect(progressCallback).toHaveBeenLastCalledWith(2, 2, expect.any(String))
    })

    it('should handle errors for individual packages', async () => {
      const packages = ['lodash', 'failing-package']

      mocks.packument.mockImplementation(async (name: string) => {
        if (name === 'failing-package') {
          throw new Error('Package not found')
        }
        return {
          name,
          versions: { '1.0.0': {} },
          'dist-tags': { latest: '1.0.0' },
        }
      })

      const result = await service.batchQueryVersions(packages)

      expect(result.has('lodash')).toBe(true)
      expect(result.has('failing-package')).toBe(false)
      expect(mocks.handlePackageQueryFailure).toHaveBeenCalled()
    })
  })

  describe('hasPackageAuthorChanged', () => {
    it('should return false when author has not changed', async () => {
      mocks.manifest.mockResolvedValue({
        author: { name: 'John Doe' },
      })

      const result = await service.hasPackageAuthorChanged('lodash', '4.17.20', '4.17.21')

      expect(result).toBe(false)
    })

    it('should return true when author has changed', async () => {
      mocks.manifest
        .mockResolvedValueOnce({ author: { name: 'John Doe' } })
        .mockResolvedValueOnce({ author: { name: 'Jane Doe' } })

      const result = await service.hasPackageAuthorChanged('lodash', '4.17.20', '4.17.21')

      expect(result).toBe(true)
    })

    it('should return false on error', async () => {
      mocks.manifest.mockRejectedValue(new Error('Network error'))

      const result = await service.hasPackageAuthorChanged('lodash', '4.17.20', '4.17.21')

      expect(result).toBe(false)
      expect(mocks.handlePackageQueryFailure).toHaveBeenCalled()
    })
  })

  describe('getDownloadStats', () => {
    it('should return download statistics', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ downloads: 10000000 }),
      })

      const result = await service.getDownloadStats('lodash', 'last-week')

      expect(result).toBe(10000000)
    })

    it('should return 0 on error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('API error'))

      const result = await service.getDownloadStats('lodash')

      expect(result).toBe(0)
      expect(mocks.handlePackageQueryFailure).toHaveBeenCalled()
    })

    it('should return 0 when API returns error status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })

      const result = await service.getDownloadStats('nonexistent-package')

      expect(result).toBe(0)
    })
  })

  describe('cache operations', () => {
    let cachedService: InstanceType<typeof NpmRegistryService>

    beforeEach(() => {
      // Reset cache mocks
      mocks.cacheGet.mockReturnValue(undefined) // Cache miss by default
      mocks.cacheGetStats.mockReturnValue({
        totalEntries: 0,
        totalSize: 0,
        hitRate: 0,
        hits: 0,
        misses: 0,
      })

      // Create service with caching enabled
      cachedService = new NpmRegistryService('https://registry.npmjs.org/', {
        cacheValidityMinutes: 10,
        retries: 1,
      })
    })

    it('should cache package versions', async () => {
      // First call - cache miss, should call API
      mocks.cacheGet.mockReturnValueOnce(undefined)
      await cachedService.getPackageVersions('lodash')

      // Second call - cache hit, return cached result
      mocks.cacheGet.mockReturnValueOnce(['4.17.19', '4.17.20', '4.17.21'])
      await cachedService.getPackageVersions('lodash')

      // Should only call API once (first call), second call uses cache
      expect(mocks.packument).toHaveBeenCalledTimes(1)
      expect(mocks.cacheGet).toHaveBeenCalledTimes(2)
      expect(mocks.cacheSet).toHaveBeenCalledTimes(1)
    })

    it('should clear all cache', async () => {
      cachedService.clearCache()

      expect(mocks.cacheClear).toHaveBeenCalled()
    })

    it('should return cache statistics', async () => {
      mocks.cacheGetStats.mockReturnValue({
        totalEntries: 5,
        totalSize: 1024,
        hitRate: 0.8,
        hits: 16,
        misses: 4,
      })

      const stats = cachedService.getCacheStats()

      expect(stats.totalEntries).toBe(5)
      expect(stats.hitRate).toBe(0.8)
      expect(stats.hits).toBe(16)
    })
  })

  describe('constructor', () => {
    it('should use default registry URL', () => {
      const defaultService = new NpmRegistryService()

      expect(defaultService).toBeInstanceOf(NpmRegistryService)
    })

    it('should normalize registry URL with trailing slash', () => {
      const serviceWithSlash = new NpmRegistryService('https://registry.npmjs.org')

      expect(serviceWithSlash).toBeInstanceOf(NpmRegistryService)
    })

    it('should accept custom options', () => {
      const customService = new NpmRegistryService('https://registry.npmjs.org/', {
        concurrency: 10,
        timeout: 60000,
        retries: 5,
        cacheValidityMinutes: 30,
      })

      expect(customService).toBeInstanceOf(NpmRegistryService)
    })
  })

  describe('scoped packages', () => {
    it('should use scoped registry for scoped packages', async () => {
      mocks.npmrcGetRegistryForPackage.mockReturnValue('https://npm.mycompany.com/')

      await service.getPackageVersions('@mycompany/private-package')

      expect(mocks.packument).toHaveBeenCalledWith(
        '@mycompany/private-package',
        expect.objectContaining({
          registry: 'https://npm.mycompany.com/',
        })
      )
    })

    it('should use auth token for private registries', async () => {
      mocks.npmrcGetAuthToken.mockReturnValue('my-secret-token')
      mocks.npmrcGetRegistryForPackage.mockReturnValue('https://npm.mycompany.com/')

      await service.getPackageVersions('@mycompany/private-package')

      expect(mocks.packument).toHaveBeenCalledWith(
        '@mycompany/private-package',
        expect.objectContaining({
          token: 'my-secret-token',
        })
      )
    })
  })
})
