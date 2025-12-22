/**
 * Security Advisory Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SecurityAdvisoryService } from '../securityAdvisoryService.js'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('SecurityAdvisoryService', () => {
  let service: SecurityAdvisoryService
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    service = new SecurityAdvisoryService({ cacheMinutes: 30, timeout: 10000 })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  describe('constructor', () => {
    it('should use default options', () => {
      const defaultService = new SecurityAdvisoryService()
      expect(defaultService).toBeDefined()
    })

    it('should accept custom options', () => {
      const customService = new SecurityAdvisoryService({
        cacheMinutes: 60,
        timeout: 5000,
        checkEcosystem: false,
      })
      expect(customService).toBeDefined()
    })
  })

  describe('queryVulnerabilities', () => {
    it('should query OSV API and return security report', async () => {
      const mockOSVResponse = {
        vulns: [
          {
            id: 'GHSA-1234-abcd-5678',
            aliases: ['CVE-2023-12345'],
            summary: 'Test vulnerability',
            details: 'Detailed description',
            severity: [{ type: 'CVSS_V3', score: '7.5' }],
            affected: [
              {
                ranges: [
                  {
                    type: 'ECOSYSTEM',
                    events: [{ introduced: '1.0.0' }, { fixed: '2.0.0' }],
                  },
                ],
              },
            ],
            references: [{ type: 'WEB', url: 'https://example.com/advisory' }],
            published: '2023-01-15T00:00:00Z',
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOSVResponse),
      })

      // Skip ecosystem discovery
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      const report = await service.queryVulnerabilities('test-package', '1.5.0')

      expect(report.packageName).toBe('test-package')
      expect(report.version).toBe('1.5.0')
      expect(report.vulnerabilities).toHaveLength(1)
      expect(report.vulnerabilities[0].id).toBe('GHSA-1234-abcd-5678')
      expect(report.vulnerabilities[0].severity).toBe('HIGH')
      expect(report.totalVulnerabilities).toBe(1)
      expect(report.hasHighVulnerabilities).toBe(true)
      expect(report.source).toBe('osv')
    })

    it('should return empty report when no vulnerabilities found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ vulns: [] }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      const report = await service.queryVulnerabilities('safe-package', '1.0.0')

      expect(report.vulnerabilities).toHaveLength(0)
      expect(report.hasCriticalVulnerabilities).toBe(false)
      expect(report.hasHighVulnerabilities).toBe(false)
      expect(report.totalVulnerabilities).toBe(0)
    })

    it('should use cached results within timeout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ vulns: [] }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      // First call
      await service.queryVulnerabilities('cached-package', '1.0.0')
      expect(mockFetch).toHaveBeenCalledTimes(2)

      // Second call should use cache
      await service.queryVulnerabilities('cached-package', '1.0.0')
      expect(mockFetch).toHaveBeenCalledTimes(2) // No additional calls
    })

    it('should refresh cache after timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ vulns: [] }),
      })

      // First call
      await service.queryVulnerabilities('expiring-package', '1.0.0')

      // Advance time past cache timeout (30 minutes)
      vi.advanceTimersByTime(31 * 60 * 1000)

      // Reset mock call count
      mockFetch.mockClear()

      // This should make new API call
      await service.queryVulnerabilities('expiring-package', '1.0.0')
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should return empty report on API error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const report = await service.queryVulnerabilities('error-package', '1.0.0')

      expect(report.vulnerabilities).toHaveLength(0)
      expect(report.totalVulnerabilities).toBe(0)
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should handle API timeout', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      mockFetch.mockRejectedValueOnce(abortError)

      const report = await service.queryVulnerabilities('timeout-package', '1.0.0')

      expect(report.vulnerabilities).toHaveLength(0)
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('severity extraction', () => {
    it('should extract CRITICAL severity from high CVSS score', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            vulns: [
              {
                id: 'CRITICAL-VULN',
                severity: [{ type: 'CVSS_V3', score: '9.5' }],
              },
            ],
          }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const report = await service.queryVulnerabilities('critical-package', '1.0.0')
      expect(report.vulnerabilities[0].severity).toBe('CRITICAL')
      expect(report.hasCriticalVulnerabilities).toBe(true)
    })

    it('should extract MODERATE severity from medium CVSS score', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            vulns: [
              {
                id: 'MODERATE-VULN',
                severity: [{ type: 'CVSS_V3', score: '5.5' }],
              },
            ],
          }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const report = await service.queryVulnerabilities('moderate-package', '1.0.0')
      expect(report.vulnerabilities[0].severity).toBe('MODERATE')
    })

    it('should extract LOW severity from low CVSS score', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            vulns: [
              {
                id: 'LOW-VULN',
                severity: [{ type: 'CVSS_V3', score: '2.0' }],
              },
            ],
          }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const report = await service.queryVulnerabilities('low-package', '1.0.0')
      expect(report.vulnerabilities[0].severity).toBe('LOW')
    })

    it('should use database_specific severity when available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            vulns: [
              {
                id: 'DB-SPECIFIC-VULN',
                database_specific: {
                  severity: 'HIGH',
                },
              },
            ],
          }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const report = await service.queryVulnerabilities('db-specific-package', '1.0.0')
      expect(report.vulnerabilities[0].severity).toBe('HIGH')
    })

    it('should return UNKNOWN when no severity info available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            vulns: [
              {
                id: 'UNKNOWN-VULN',
              },
            ],
          }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const report = await service.queryVulnerabilities('unknown-package', '1.0.0')
      expect(report.vulnerabilities[0].severity).toBe('UNKNOWN')
    })
  })

  describe('affected and fixed versions', () => {
    it('should extract affected version ranges', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            vulns: [
              {
                id: 'RANGE-VULN',
                affected: [
                  {
                    ranges: [
                      {
                        type: 'ECOSYSTEM',
                        events: [{ introduced: '1.0.0' }, { fixed: '2.0.0' }],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const report = await service.queryVulnerabilities('range-package', '1.5.0')
      expect(report.vulnerabilities[0].affectedVersions).toBe('>=1.0.0 <2.0.0')
      expect(report.vulnerabilities[0].fixedVersions).toContain('2.0.0')
    })

    it('should handle open-ended affected ranges', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            vulns: [
              {
                id: 'OPEN-RANGE-VULN',
                affected: [
                  {
                    ranges: [
                      {
                        type: 'ECOSYSTEM',
                        events: [{ introduced: '1.0.0' }],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const report = await service.queryVulnerabilities('open-range-package', '1.5.0')
      expect(report.vulnerabilities[0].affectedVersions).toBe('>=1.0.0')
    })

    it('should return Unknown when no affected info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            vulns: [
              {
                id: 'NO-AFFECTED-VULN',
              },
            ],
          }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const report = await service.queryVulnerabilities('no-affected-package', '1.5.0')
      expect(report.vulnerabilities[0].affectedVersions).toBe('Unknown')
    })
  })

  describe('queryMultiplePackages', () => {
    it('should query multiple packages in parallel', async () => {
      // Mock responses for each package
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ vulns: [] }),
      })

      const packages = [
        { name: 'pkg-1', version: '1.0.0' },
        { name: 'pkg-2', version: '2.0.0' },
        { name: 'pkg-3', version: '3.0.0' },
      ]

      const results = await service.queryMultiplePackages(packages)

      expect(results.size).toBe(3)
      expect(results.has('pkg-1@1.0.0')).toBe(true)
      expect(results.has('pkg-2@2.0.0')).toBe(true)
      expect(results.has('pkg-3@3.0.0')).toBe(true)
    })
  })

  describe('formatForPrompt', () => {
    it('should format no vulnerabilities message', () => {
      const report = {
        packageName: 'safe-package',
        version: '1.0.0',
        vulnerabilities: [],
        hasCriticalVulnerabilities: false,
        hasHighVulnerabilities: false,
        totalVulnerabilities: 0,
        queriedAt: new Date(),
        source: 'osv' as const,
      }

      const result = service.formatForPrompt(report)
      expect(result).toContain('No known vulnerabilities found')
      expect(result).toContain('safe-package@1.0.0')
    })

    it('should format vulnerabilities with severity', () => {
      const report = {
        packageName: 'vulnerable-package',
        version: '1.0.0',
        vulnerabilities: [
          {
            id: 'GHSA-1234',
            aliases: ['CVE-2023-12345'],
            summary: 'Test vulnerability',
            details: 'Details',
            severity: 'HIGH' as const,
            cvssScore: 7.5,
            affectedVersions: '>=1.0.0 <2.0.0',
            fixedVersions: ['2.0.0'],
            references: [],
          },
        ],
        hasCriticalVulnerabilities: false,
        hasHighVulnerabilities: true,
        totalVulnerabilities: 1,
        queriedAt: new Date(),
        source: 'osv' as const,
      }

      const result = service.formatForPrompt(report)
      expect(result).toContain('SECURITY ALERT')
      expect(result).toContain('1 vulnerability')
      expect(result).toContain('[HIGH]')
      expect(result).toContain('CVE-2023-12345')
      expect(result).toContain('Fixed in: 2.0.0')
      expect(result).toContain('HIGH RISK')
    })

    it('should include critical warning for critical vulnerabilities', () => {
      const report = {
        packageName: 'critical-package',
        version: '1.0.0',
        vulnerabilities: [
          {
            id: 'CRITICAL-VULN',
            aliases: [],
            summary: 'Critical vulnerability',
            details: '',
            severity: 'CRITICAL' as const,
            cvssScore: 9.8,
            affectedVersions: '>=1.0.0',
            fixedVersions: [],
            references: [],
          },
        ],
        hasCriticalVulnerabilities: true,
        hasHighVulnerabilities: true,
        totalVulnerabilities: 1,
        queriedAt: new Date(),
        source: 'osv' as const,
      }

      const result = service.formatForPrompt(report)
      expect(result).toContain('CRITICAL')
      expect(result).toContain('DO NOT recommend updating to this version')
    })
  })

  describe('clearCache', () => {
    it('should clear all cached results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ vulns: [] }),
      })

      // Populate cache
      await service.queryVulnerabilities('cached-pkg', '1.0.0')

      // Clear cache
      service.clearCache()

      // Reset mock to track new calls
      mockFetch.mockClear()

      // Should make new API call
      await service.queryVulnerabilities('cached-pkg', '1.0.0')
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('findSafeVersion', () => {
    it('should find a safe version without vulnerabilities', async () => {
      // Mock npm registry response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            versions: {
              '1.0.0': {},
              '1.0.1': {},
              '1.1.0': {},
              '2.0.0': {},
            },
          }),
      })

      // Mock OSV response for 1.0.1 - has vulnerability
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            vulns: [{ id: 'VULN-1', severity: [{ type: 'CVSS_V3', score: '8.0' }] }],
          }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      // Mock OSV response for 1.1.0 - safe
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ vulns: [] }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const result = await service.findSafeVersion('test-package', '1.0.0')

      expect(result).toBeDefined()
      expect(result?.version).toBe('1.1.0')
      expect(result?.sameMajor).toBe(true)
      expect(result?.sameMinor).toBe(false)
      expect(result?.skippedVersions).toHaveLength(1)
      expect(result?.skippedVersions[0].version).toBe('1.0.1')
    })

    it('should return undefined when no safe version found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            versions: {
              '1.0.0': {},
            },
          }),
      })

      const result = await service.findSafeVersion('no-newer-package', '1.0.0')
      expect(result).toBeUndefined()
    })

    it('should skip prerelease versions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            versions: {
              '1.0.0': {},
              '1.0.1-alpha': {},
              '1.0.1-beta': {},
              '1.0.1': {},
            },
          }),
      })

      // Mock OSV response for 1.0.1 - safe
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ vulns: [] }),
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const result = await service.findSafeVersion('prerelease-package', '1.0.0')

      expect(result).toBeDefined()
      expect(result?.version).toBe('1.0.1')
      // Alpha and beta versions should not be in skipped
      expect(result?.skippedVersions).toHaveLength(0)
    })

    it('should handle npm registry error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await service.findSafeVersion('nonexistent-package', '1.0.0')
      expect(result).toBeUndefined()
    })
  })

  describe('ecosystem package discovery', () => {
    it('should check ecosystem packages when enabled', async () => {
      const ecoService = new SecurityAdvisoryService({ checkEcosystem: true })

      // Mock main package OSV query
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ vulns: [] }),
      })

      // Mock npm registry for ecosystem discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            dependencies: { 'dep-a': '^1.0.0' },
          }),
      })

      await ecoService.queryVulnerabilities('eco-package', '1.0.0')

      // Should have made multiple fetch calls
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('normalizeRepoUrl', () => {
    it('should handle different repository URL formats', async () => {
      // Access private method through a test query
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            dependencies: {},
            repository: {
              url: 'git+https://github.com/facebook/react.git',
              directory: 'packages/react',
            },
          }),
      })

      // Additional mocks for sibling search
      mockFetch.mockResolvedValue({
        ok: false,
      })

      const ecoService = new SecurityAdvisoryService({ checkEcosystem: true })
      await ecoService.queryVulnerabilities('react', '18.2.0')

      // The service should have attempted to normalize the URL
      expect(mockFetch).toHaveBeenCalled()
    })
  })
})
