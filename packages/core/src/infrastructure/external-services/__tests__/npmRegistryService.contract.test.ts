/**
 * Contract Tests for NpmRegistryService
 *
 * These tests verify that NpmRegistryService correctly interacts with
 * npm Downloads API according to their API contracts.
 *
 * Note: npm Registry API (getPackageVersions, getLatestVersion) uses
 * npm-registry-fetch/pacote which cannot be intercepted by MSW.
 * Those APIs are tested in npmRegistryService.test.ts with vi.mock.
 *
 * Using MSW to mock HTTP requests, we ensure:
 * 1. Correct request format (method, headers, URL parameters)
 * 2. Proper handling of various response scenarios
 * 3. Error handling for network and API failures
 * 4. Correct parsing of API responses
 */

import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { NpmRegistryService } from '../npmRegistryService.js'
import { server, setMockDownloadStats, setupMswServer } from './mocks/server.js'

// Setup MSW server for all tests in this file
setupMswServer()

describe('NpmRegistryService Contract Tests - Downloads API', () => {
  let service: NpmRegistryService

  beforeEach(() => {
    // Create service with short timeout and no cache for faster tests
    service = new NpmRegistryService('https://registry.npmjs.org/', {
      cacheValidityMinutes: 0, // Disable cache for contract tests
      timeout: 5000,
      retries: 1,
    })
  })

  describe('Download Stats API Contract', () => {
    it('should fetch download statistics for a package', async () => {
      setMockDownloadStats('popular-pkg', 'last-week', 1000000)

      const downloads = await service.getDownloadStats('popular-pkg', 'last-week')

      expect(downloads).toBe(1000000)
    })

    it('should handle different time periods', async () => {
      setMockDownloadStats('time-pkg', 'last-day', 1000)
      setMockDownloadStats('time-pkg', 'last-week', 7000)
      setMockDownloadStats('time-pkg', 'last-month', 30000)

      const dailyDownloads = await service.getDownloadStats('time-pkg', 'last-day')
      const weeklyDownloads = await service.getDownloadStats('time-pkg', 'last-week')
      const monthlyDownloads = await service.getDownloadStats('time-pkg', 'last-month')

      expect(dailyDownloads).toBe(1000)
      expect(weeklyDownloads).toBe(7000)
      expect(monthlyDownloads).toBe(30000)
    })

    it('should use default period (last-week) when not specified', async () => {
      setMockDownloadStats('default-period-pkg', 'last-week', 5000)

      const downloads = await service.getDownloadStats('default-period-pkg')

      expect(downloads).toBe(5000)
    })

    it('should return default value for unknown packages', async () => {
      // Default mock returns 10000 for unknown packages
      const downloads = await service.getDownloadStats('unknown-pkg')

      expect(downloads).toBe(10000)
    })

    it('should handle zero downloads', async () => {
      setMockDownloadStats('zero-downloads-pkg', 'last-week', 0)

      const downloads = await service.getDownloadStats('zero-downloads-pkg', 'last-week')

      expect(downloads).toBe(0)
    })

    it('should handle very large download numbers', async () => {
      setMockDownloadStats('mega-popular-pkg', 'last-week', 100000000)

      const downloads = await service.getDownloadStats('mega-popular-pkg', 'last-week')

      expect(downloads).toBe(100000000)
    })
  })

  describe('Configurable API URL Contract', () => {
    it('should use configured npm downloads API URL', async () => {
      // Create service with custom downloads API URL
      const customService = new NpmRegistryService('https://registry.npmjs.org/', {
        cacheValidityMinutes: 0,
        npmDownloadsApiUrl: 'https://api.npmjs.org', // Default URL
      })

      setMockDownloadStats('config-test-pkg', 'last-week', 5000)

      const downloads = await customService.getDownloadStats('config-test-pkg', 'last-week')

      expect(downloads).toBe(5000)
    })

    it('should handle trailing slash in configured URL', async () => {
      // Create service with trailing slash in downloads API URL
      const customService = new NpmRegistryService('https://registry.npmjs.org/', {
        cacheValidityMinutes: 0,
        npmDownloadsApiUrl: 'https://api.npmjs.org/', // With trailing slash
      })

      setMockDownloadStats('trailing-slash-pkg', 'last-week', 3000)

      const downloads = await customService.getDownloadStats('trailing-slash-pkg', 'last-week')

      expect(downloads).toBe(3000)
    })
  })

  describe('Error Handling Contract', () => {
    it('should return 0 on API error (500)', async () => {
      server.use(
        http.get('https://api.npmjs.org/downloads/point/:period/:packageName', () => {
          return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
        })
      )

      const downloads = await service.getDownloadStats('error-pkg')

      expect(downloads).toBe(0)
    })

    it('should return 0 on not found (404)', async () => {
      server.use(
        http.get('https://api.npmjs.org/downloads/point/:period/:packageName', () => {
          return new HttpResponse(null, { status: 404, statusText: 'Not Found' })
        })
      )

      const downloads = await service.getDownloadStats('not-found-pkg')

      expect(downloads).toBe(0)
    })

    it('should handle malformed JSON response gracefully', async () => {
      server.use(
        http.get('https://api.npmjs.org/downloads/point/:period/:packageName', () => {
          return new HttpResponse('not valid json', {
            headers: { 'Content-Type': 'application/json' },
          })
        })
      )

      const downloads = await service.getDownloadStats('malformed-pkg')

      expect(downloads).toBe(0)
    })

    it('should handle missing downloads field in response', async () => {
      server.use(
        http.get('https://api.npmjs.org/downloads/point/:period/:packageName', () => {
          return HttpResponse.json({
            package: 'missing-field-pkg',
            start: '2024-01-01',
            end: '2024-01-07',
            // downloads field is missing
          })
        })
      )

      const downloads = await service.getDownloadStats('missing-field-pkg')

      // Should handle gracefully - either return 0 or NaN becomes 0
      expect(typeof downloads).toBe('number')
    })
  })

  describe('Scoped Package Handling', () => {
    it('should correctly fetch download stats for scoped packages', async () => {
      setMockDownloadStats('@scope/package', 'last-week', 25000)

      const downloads = await service.getDownloadStats('@scope/package', 'last-week')

      expect(downloads).toBe(25000)
    })

    it('should handle deeply scoped packages', async () => {
      setMockDownloadStats('@organization/deep-package', 'last-month', 50000)

      const downloads = await service.getDownloadStats('@organization/deep-package', 'last-month')

      expect(downloads).toBe(50000)
    })
  })
})
