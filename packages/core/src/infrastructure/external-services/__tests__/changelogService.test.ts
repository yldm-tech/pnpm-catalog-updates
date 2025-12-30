/**
 * ChangelogService Tests
 *
 * TEST-002: Unit tests for ChangelogService
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Setup mocks before imports
const mocks = vi.hoisted(() => ({
  handlePackageQueryFailure: vi.fn(),
}))

vi.mock('@pcu/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pcu/utils')>()
  return {
    ...actual,
    UserFriendlyErrorHandler: {
      handlePackageQueryFailure: mocks.handlePackageQueryFailure,
    },
  }
})

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after mocks
import { ChangelogService } from '../changelogService.js'

describe('ChangelogService', () => {
  let service: ChangelogService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ChangelogService({ cacheMinutes: 30 })
  })

  afterEach(() => {
    service.clearCache()
  })

  describe('constructor', () => {
    it('should create service instance with default options', () => {
      const defaultService = new ChangelogService()
      expect(defaultService).toBeDefined()
    })

    it('should create service instance with custom cache timeout', () => {
      const customService = new ChangelogService({ cacheMinutes: 60 })
      expect(customService).toBeDefined()
    })
  })

  describe('getChangelog', () => {
    it('should return changelog with npm url when no repository provided', async () => {
      const changelog = await service.getChangelog('lodash', '4.17.20', '4.17.21')

      expect(changelog).toBeDefined()
      expect(changelog.packageName).toBe('lodash')
      expect(changelog.releases).toHaveLength(0)
      expect(changelog.changelogUrl).toBe('https://www.npmjs.com/package/lodash?activeTab=versions')
    })

    it('should fetch GitHub releases when repository is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: 'v4.17.21',
            name: 'v4.17.21',
            body: 'Bug fixes and improvements',
            published_at: '2024-01-15T10:00:00Z',
            html_url: 'https://github.com/lodash/lodash/releases/tag/v4.17.21',
            prerelease: false,
          },
        ],
      })

      const changelog = await service.getChangelog('lodash', '4.17.20', '4.17.21', {
        type: 'git',
        url: 'https://github.com/lodash/lodash',
      })

      expect(changelog).toBeDefined()
      expect(changelog.packageName).toBe('lodash')
      expect(changelog.repository?.owner).toBe('lodash')
      expect(changelog.repository?.repo).toBe('lodash')
      expect(changelog.releases).toHaveLength(1)
      expect(changelog.releases[0].version).toBe('4.17.21')
    })

    it('should handle GitHub API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const changelog = await service.getChangelog('unknown-package', '1.0.0', '2.0.0', {
        type: 'git',
        url: 'https://github.com/unknown/unknown-package',
      })

      expect(changelog.error).toBe('Unable to fetch releases from GitHub')
      expect(mocks.handlePackageQueryFailure).toHaveBeenCalled()
    })

    it('should cache changelog results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      // First call
      await service.getChangelog('lodash', '4.17.20', '4.17.21', {
        url: 'https://github.com/lodash/lodash',
      })

      // Second call should use cache
      await service.getChangelog('lodash', '4.17.20', '4.17.21', {
        url: 'https://github.com/lodash/lodash',
      })

      // Fetch should only be called once
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should parse various GitHub URL formats', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      })

      // Test https format
      let changelog = await service.getChangelog('pkg1', '1.0.0', '2.0.0', {
        url: 'https://github.com/owner/repo',
      })
      expect(changelog.repository?.owner).toBe('owner')
      expect(changelog.repository?.repo).toBe('repo')

      service.clearCache()

      // Test .git suffix
      changelog = await service.getChangelog('pkg2', '1.0.0', '2.0.0', {
        url: 'https://github.com/owner/repo.git',
      })
      expect(changelog.repository?.owner).toBe('owner')
      expect(changelog.repository?.repo).toBe('repo')

      service.clearCache()

      // Test github: shorthand
      changelog = await service.getChangelog('pkg3', '1.0.0', '2.0.0', {
        url: 'github:owner/repo',
      })
      expect(changelog.repository?.owner).toBe('owner')
      expect(changelog.repository?.repo).toBe('repo')
    })

    it('should filter releases between versions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { tag_name: 'v2.0.0', published_at: '2024-03-01T10:00:00Z' },
          { tag_name: 'v1.5.0', published_at: '2024-02-01T10:00:00Z' },
          { tag_name: 'v1.2.0', published_at: '2024-01-15T10:00:00Z' },
          { tag_name: 'v1.0.0', published_at: '2024-01-01T10:00:00Z' },
        ],
      })

      const changelog = await service.getChangelog('test-pkg', '1.0.0', '1.5.0', {
        url: 'https://github.com/test/test-pkg',
      })

      // Should include 1.2.0 and 1.5.0, but not 1.0.0 (from version) or 2.0.0 (above to)
      expect(changelog.releases).toHaveLength(2)
      expect(changelog.releases.map((r) => r.version)).toContain('1.5.0')
      expect(changelog.releases.map((r) => r.version)).toContain('1.2.0')
    })

    it('should detect breaking changes in release body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: 'v2.0.0',
            body: 'BREAKING CHANGE: removed deprecated API',
            published_at: '2024-01-15T10:00:00Z',
          },
        ],
      })

      const changelog = await service.getChangelog('test-pkg', '1.0.0', '2.0.0', {
        url: 'https://github.com/test/test-pkg',
      })

      expect(changelog.releases[0].breaking).toBe(true)
    })

    it('should handle prerelease tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: 'v2.0.0-beta.1',
            prerelease: true,
            published_at: '2024-01-15T10:00:00Z',
          },
        ],
      })

      const changelog = await service.getChangelog('test-pkg', '1.0.0', '2.0.0-beta.1', {
        url: 'https://github.com/test/test-pkg',
      })

      expect(changelog.releases[0].isPrerelease).toBe(true)
    })
  })

  describe('formatChangelog', () => {
    it('should format changelog with releases', () => {
      const changelog = {
        packageName: 'lodash',
        releases: [
          {
            version: '4.17.21',
            date: '2024-01-15',
            title: 'Bug Fix Release',
            body: 'Fixed various issues',
            url: 'https://github.com/lodash/lodash/releases/tag/v4.17.21',
          },
        ],
        changelogUrl: 'https://github.com/lodash/lodash/releases',
      }

      const formatted = service.formatChangelog(changelog)

      expect(formatted).toContain('Releases (1)')
      expect(formatted).toContain('4.17.21')
      expect(formatted).toContain('2024-01-15')
      expect(formatted).toContain('Bug Fix Release')
    })

    it('should format changelog with no releases but URL', () => {
      const changelog = {
        packageName: 'lodash',
        releases: [],
        changelogUrl: 'https://www.npmjs.com/package/lodash?activeTab=versions',
      }

      const formatted = service.formatChangelog(changelog)

      expect(formatted).toContain('Changelog:')
      expect(formatted).toContain('npmjs.com')
    })

    it('should format changelog with error', () => {
      const changelog = {
        packageName: 'lodash',
        releases: [],
        error: 'Unable to fetch releases',
      }

      const formatted = service.formatChangelog(changelog)

      expect(formatted).toContain('Unable to fetch releases')
    })

    it('should show verbose body when verbose is true', () => {
      const changelog = {
        packageName: 'lodash',
        releases: [
          {
            version: '4.17.21',
            body: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6',
          },
        ],
      }

      const formatted = service.formatChangelog(changelog, true)

      expect(formatted).toContain('Line 1')
      expect(formatted).toContain('Line 5')
      expect(formatted).toContain('...')
    })

    it('should show breaking change icon', () => {
      const changelog = {
        packageName: 'lodash',
        releases: [
          {
            version: '5.0.0',
            breaking: true,
          },
        ],
      }

      const formatted = service.formatChangelog(changelog)

      expect(formatted).toContain('⚠️')
    })

    it('should show prerelease icon', () => {
      const changelog = {
        packageName: 'lodash',
        releases: [
          {
            version: '5.0.0-beta.1',
            isPrerelease: true,
          },
        ],
      }

      const formatted = service.formatChangelog(changelog)

      expect(formatted).toContain('🔬')
    })
  })

  describe('clearCache', () => {
    it('should clear all cached entries', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      })

      // First call - should fetch
      await service.getChangelog('lodash', '4.17.20', '4.17.21', {
        url: 'https://github.com/lodash/lodash',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Clear cache
      service.clearCache()

      // Second call - should fetch again
      await service.getChangelog('lodash', '4.17.20', '4.17.21', {
        url: 'https://github.com/lodash/lodash',
      })

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
