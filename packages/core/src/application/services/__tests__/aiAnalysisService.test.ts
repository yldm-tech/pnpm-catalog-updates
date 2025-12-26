/**
 * AI Analysis Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PackageUpdateInfo, WorkspaceInfo } from '../../../domain/interfaces/aiProvider.js'

const { AIAnalysisService } = await import('../aiAnalysisService.js')

describe('AIAnalysisService', () => {
  let service: InstanceType<typeof AIAnalysisService>

  const packages: PackageUpdateInfo[] = [
    {
      name: 'lodash',
      currentVersion: '4.17.20',
      targetVersion: '4.17.21',
      updateType: 'patch',
    },
    {
      name: 'react',
      currentVersion: '17.0.0',
      targetVersion: '18.0.0',
      updateType: 'major',
    },
  ]

  const workspaceInfo: WorkspaceInfo = {
    name: 'test-workspace',
    path: '/test/path',
    packageCount: 5,
    catalogCount: 1,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Use injected providers to avoid calling real CLIs in test environments.
    service = new AIAnalysisService({
      config: { securityData: { enabled: false } },
      providers: [],
    })
  })

  afterEach(() => {
    service.clearCache()
  })

  describe('analyzeUpdates', () => {
    it('should return disabled result when AI is disabled', async () => {
      const disabledService = new AIAnalysisService({
        config: { enabled: false },
      })

      const result = await disabledService.analyzeUpdates(packages, workspaceInfo)

      expect(result.provider).toBe('none')
      expect(result.recommendations).toHaveLength(2)
      expect(result.recommendations[0]?.action).toBe('review')
      expect(result.summary).toContain('disabled')
    })

    it('should use rule engine fallback when no provider available', async () => {
      const result = await service.analyzeUpdates(packages, workspaceInfo)

      expect(result.provider).toBe('rule-engine')
      expect(result.recommendations).toHaveLength(2)
    })

    it('should respect analysis type option', async () => {
      const result = await service.analyzeUpdates(packages, workspaceInfo, {
        analysisType: 'security',
      })

      expect(result.analysisType).toBe('security')
    })
  })

  describe('analyzeImpact', () => {
    it('should analyze with impact type', async () => {
      const result = await service.analyzeImpact(packages, workspaceInfo)

      expect(result.analysisType).toBe('impact')
    })
  })

  describe('analyzeSecurity', () => {
    it('should analyze with security type', async () => {
      const result = await service.analyzeSecurity(packages, workspaceInfo)

      expect(result.analysisType).toBe('security')
    })
  })

  describe('analyzeCompatibility', () => {
    it('should analyze with compatibility type', async () => {
      const result = await service.analyzeCompatibility(packages, workspaceInfo)

      expect(result.analysisType).toBe('compatibility')
    })
  })

  describe('getRecommendations', () => {
    it('should analyze with recommend type', async () => {
      const result = await service.getRecommendations(packages, workspaceInfo)

      expect(result.analysisType).toBe('recommend')
    })
  })

  describe('cache operations', () => {
    it('should cache results and return cached on second call', async () => {
      const result1 = await service.analyzeUpdates(packages, workspaceInfo)
      const result2 = await service.analyzeUpdates(packages, workspaceInfo)

      expect(result2.provider).toContain('cached')
    })

    it('should skip cache when skipCache option is true', async () => {
      await service.analyzeUpdates(packages, workspaceInfo)
      const result = await service.analyzeUpdates(packages, workspaceInfo, {
        skipCache: true,
      })

      expect(result.provider).not.toContain('cached')
    })

    it('should invalidate cache for specific packages', async () => {
      await service.analyzeUpdates(packages, workspaceInfo)

      service.invalidateCache(['lodash'])

      const result = await service.analyzeUpdates(packages, workspaceInfo)
      expect(result.provider).not.toContain('cached')
    })

    it('should clear all cache', async () => {
      await service.analyzeUpdates(packages, workspaceInfo)

      service.clearCache()

      const stats = service.getCacheStats()
      expect(stats.totalEntries).toBe(0)
    })

    it('should return cache stats', () => {
      const stats = service.getCacheStats()

      expect(stats).toHaveProperty('totalEntries')
      expect(stats).toHaveProperty('hits')
      expect(stats).toHaveProperty('misses')
    })
  })

  describe('isAvailable', () => {
    it('should return true when fallback enabled even without providers', async () => {
      const serviceWithFallback = new AIAnalysisService({
        config: {
          fallback: { enabled: true, useRuleEngine: true },
        },
      })

      const available = await serviceWithFallback.isAvailable()
      expect(available).toBe(true)
    })

    it('should return false when disabled', async () => {
      const disabledService = new AIAnalysisService({
        config: { enabled: false },
      })

      const available = await disabledService.isAvailable()
      expect(available).toBe(false)
    })
  })

  describe('getStatus', () => {
    it('should return service status', async () => {
      const status = await service.getStatus()

      expect(status).toHaveProperty('enabled')
      expect(status).toHaveProperty('providers')
      expect(status).toHaveProperty('activeProvider')
      expect(status).toHaveProperty('cacheEnabled')
      expect(status).toHaveProperty('cacheStats')
      expect(status).toHaveProperty('fallbackEnabled')
    })
  })

  describe('analyzeComprehensive', () => {
    it('should run all analysis types', async () => {
      const result = await service.analyzeComprehensive(packages, workspaceInfo)

      expect(result.primary).toBeDefined()
      expect(result.providers).toContain('rule-engine')
      expect(result.timestamp).toBeInstanceOf(Date)
    })

    it('should merge results from multiple analysis types', async () => {
      const result = await service.analyzeComprehensive(packages, workspaceInfo)

      expect(result.merged).toBeDefined()
      expect(result.merged?.recommendations.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('analyzeWithChunking', () => {
    // Create a large package set for chunking tests
    const createLargePackageSet = (count: number): PackageUpdateInfo[] => {
      return Array.from({ length: count }, (_, i) => ({
        name: `package-${i}`,
        currentVersion: '1.0.0',
        targetVersion: '1.0.1',
        updateType: 'patch' as const,
      }))
    }

    it('should skip chunking when package count is below threshold', async () => {
      const smallPackages = createLargePackageSet(20)

      const result = await service.analyzeWithChunking(smallPackages, workspaceInfo, {
        chunking: { threshold: 50, chunkSize: 10 },
      })

      expect(result.provider).toBe('rule-engine')
      expect(result.recommendations).toHaveLength(20)
    })

    it('should use chunking when package count exceeds threshold', async () => {
      const largePackages = createLargePackageSet(60)

      const result = await service.analyzeWithChunking(largePackages, workspaceInfo, {
        chunking: { threshold: 50, chunkSize: 20 },
      })

      expect(result.recommendations).toHaveLength(60)
      expect(result.summary).toContain('Chunked analysis completed')
      expect(result.summary).toContain('3 chunks')
    })

    it('should report progress during chunked analysis', async () => {
      const largePackages = createLargePackageSet(60)
      const progressReports: Array<{
        currentChunk: number
        totalChunks: number
        percentComplete: number
      }> = []

      await service.analyzeWithChunking(largePackages, workspaceInfo, {
        chunking: {
          threshold: 50,
          chunkSize: 20,
          onProgress: (progress) => {
            progressReports.push({
              currentChunk: progress.currentChunk,
              totalChunks: progress.totalChunks,
              percentComplete: progress.percentComplete,
            })
          },
        },
      })

      // Should have 4 progress reports (3 chunks + final 100%)
      expect(progressReports.length).toBeGreaterThanOrEqual(3)
      expect(progressReports[progressReports.length - 1]?.percentComplete).toBe(100)
    })

    it('should handle chunking disabled option', async () => {
      const largePackages = createLargePackageSet(60)

      const result = await service.analyzeWithChunking(largePackages, workspaceInfo, {
        chunking: { enabled: false },
      })

      // Should process all packages without chunking
      expect(result.recommendations).toHaveLength(60)
      expect(result.summary).not.toContain('Chunked analysis')
    })

    it('should use custom chunk size', async () => {
      const largePackages = createLargePackageSet(100)
      const progressReports: Array<{ totalChunks: number }> = []

      await service.analyzeWithChunking(largePackages, workspaceInfo, {
        chunking: {
          threshold: 50,
          chunkSize: 25, // 100 / 25 = 4 chunks
          onProgress: (progress) => {
            progressReports.push({ totalChunks: progress.totalChunks })
          },
        },
      })

      expect(progressReports[0]?.totalChunks).toBe(4)
    })

    it('should aggregate confidence scores from chunks', async () => {
      const largePackages = createLargePackageSet(60)

      const result = await service.analyzeWithChunking(largePackages, workspaceInfo, {
        chunking: { threshold: 50, chunkSize: 20 },
      })

      // Confidence should be averaged across chunks
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('should deduplicate warnings from multiple chunks', async () => {
      const largePackages = createLargePackageSet(60)

      const result = await service.analyzeWithChunking(largePackages, workspaceInfo, {
        chunking: { threshold: 50, chunkSize: 20 },
      })

      // Warnings should be deduplicated
      if (result.warnings && result.warnings.length > 0) {
        const uniqueWarnings = [...new Set(result.warnings)]
        expect(result.warnings.length).toBe(uniqueWarnings.length)
      }
    })
  })
})
