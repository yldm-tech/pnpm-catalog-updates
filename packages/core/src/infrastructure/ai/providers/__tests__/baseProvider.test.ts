/**
 * Base AI Provider Tests
 *
 * Tests the base provider functionality including prompt building and response parsing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisContext } from '../../../../domain/interfaces/aiProvider.js'

// Mock the logger
vi.mock('@pcu/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('@pcu/utils')>()
  return {
    ...original,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

import type {
  AIProviderInfo,
  AnalysisResult,
  AnalysisType,
} from '../../../../domain/interfaces/aiProvider.js'
// Create a concrete test implementation of BaseAIProvider
import { BaseAIProvider, type BaseProviderOptions } from '../baseProvider.js'

class TestProvider extends BaseAIProvider {
  readonly name = 'test'
  readonly priority = 50
  readonly capabilities: AnalysisType[] = ['impact', 'security']

  constructor(options: BaseProviderOptions = {}) {
    super(options)
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getInfo(): Promise<AIProviderInfo> {
    return {
      name: this.name,
      version: '1.0.0',
      path: '/test/path',
      available: true,
      priority: this.priority,
      capabilities: this.capabilities,
    }
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const prompt = this.buildPrompt(context)
    return this.parseResponse('{"summary": "test", "recommendations": []}', context)
  }

  clearCache(): void {
    // No-op for test
  }

  // Expose protected methods for testing
  public testBuildPrompt(context: AnalysisContext): string {
    return this.buildPrompt(context)
  }

  public testParseResponse(response: string, context: AnalysisContext): AnalysisResult {
    return this.parseResponse(response, context)
  }

  public testFormatSecurityData(context: AnalysisContext): string {
    return this.formatSecurityData(context)
  }

  public testCreateFallbackResult(context: AnalysisContext, rawResponse: string): AnalysisResult {
    return this.createFallbackResult(context, rawResponse)
  }
}

describe('BaseAIProvider', () => {
  let provider: TestProvider

  const createMockContext = (overrides: Partial<AnalysisContext> = {}): AnalysisContext => ({
    packages: [
      {
        name: 'lodash',
        currentVersion: '4.17.20',
        targetVersion: '4.17.21',
        updateType: 'patch',
      },
    ],
    workspaceInfo: {
      name: 'test-workspace',
      packageCount: 5,
      catalogCount: 2,
    },
    analysisType: 'impact',
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new TestProvider()
  })

  describe('constructor', () => {
    it('should use default values when no options provided', () => {
      const p = new TestProvider()
      expect(p.name).toBe('test')
      expect(p.priority).toBe(50)
    })

    it('should accept custom options', () => {
      const p = new TestProvider({
        timeout: 60000,
        detectionTimeout: 5000,
        maxRetries: 5,
      })
      expect(p.name).toBe('test')
    })
  })

  describe('buildPrompt', () => {
    it('should build impact analysis prompt', () => {
      const context = createMockContext({ analysisType: 'impact' })
      const prompt = provider.testBuildPrompt(context)

      expect(prompt).toContain('Analyze the impact')
      expect(prompt).toContain('lodash')
      expect(prompt).toContain('4.17.20')
      expect(prompt).toContain('4.17.21')
      expect(prompt).toContain('test-workspace')
    })

    it('should build security analysis prompt', () => {
      const context = createMockContext({ analysisType: 'security' })
      const prompt = provider.testBuildPrompt(context)

      expect(prompt).toContain('security implications')
      expect(prompt).toContain('vulnerabilities')
    })

    it('should build compatibility analysis prompt', () => {
      const context = createMockContext({ analysisType: 'compatibility' })
      const prompt = provider.testBuildPrompt(context)

      expect(prompt).toContain('compatibility')
      expect(prompt).toContain('peer dependency')
    })

    it('should build recommend analysis prompt', () => {
      const context = createMockContext({ analysisType: 'recommend' })
      const prompt = provider.testBuildPrompt(context)

      expect(prompt).toContain('smart recommendations')
      expect(prompt).toContain('priority')
    })

    it('should include catalog name when present', () => {
      const context = createMockContext({
        packages: [
          {
            name: 'react',
            currentVersion: '18.0.0',
            targetVersion: '18.2.0',
            updateType: 'minor',
            catalogName: 'frontend',
          },
        ],
      })
      const prompt = provider.testBuildPrompt(context)

      expect(prompt).toContain('catalog: frontend')
    })
  })

  describe('formatSecurityData', () => {
    it('should return empty string when no security data', () => {
      const context = createMockContext()
      const result = provider.testFormatSecurityData(context)

      expect(result).toBe('')
    })

    it('should return empty string when security data is empty', () => {
      const context = createMockContext({ securityData: new Map() })
      const result = provider.testFormatSecurityData(context)

      expect(result).toBe('')
    })

    it('should format security vulnerabilities', () => {
      const securityData = new Map([
        [
          'lodash@4.17.21',
          {
            totalVulnerabilities: 1,
            hasCriticalVulnerabilities: true,
            hasHighVulnerabilities: false,
            vulnerabilities: [
              {
                id: 'GHSA-xxxx',
                severity: 'CRITICAL' as const,
                summary: 'Test vulnerability',
                aliases: ['CVE-2023-1234'],
                fixedVersions: ['4.17.22'],
              },
            ],
          },
        ],
      ])

      const context = createMockContext({ securityData })
      const result = provider.testFormatSecurityData(context)

      expect(result).toContain('SECURITY VULNERABILITY DATA')
      expect(result).toContain('CRITICAL')
      expect(result).toContain('CVE-2023-1234')
      expect(result).toContain('DO NOT recommend')
    })

    it('should show safe version recommendation when available', () => {
      const securityData = new Map([
        [
          'lodash@4.17.21',
          {
            totalVulnerabilities: 1,
            hasCriticalVulnerabilities: false,
            hasHighVulnerabilities: true,
            vulnerabilities: [
              {
                id: 'GHSA-yyyy',
                severity: 'HIGH' as const,
                summary: 'High severity issue',
                aliases: [],
                fixedVersions: ['4.17.22'],
              },
            ],
            safeVersion: {
              version: '4.17.22',
              sameMajor: true,
              sameMinor: true,
              versionsChecked: 2,
            },
          },
        ],
      ])

      const context = createMockContext({ securityData })
      const result = provider.testFormatSecurityData(context)

      expect(result).toContain('VERIFIED SAFE VERSION')
      expect(result).toContain('4.17.22')
    })
  })

  describe('parseResponse', () => {
    it('should parse valid JSON response', () => {
      const context = createMockContext()
      const response = JSON.stringify({
        summary: 'Analysis complete',
        recommendations: [
          {
            package: 'lodash',
            currentVersion: '4.17.20',
            targetVersion: '4.17.21',
            action: 'update',
            reason: 'Safe patch update',
            riskLevel: 'low',
            breakingChanges: [],
            securityFixes: [],
            estimatedEffort: 'low',
          },
        ],
        warnings: ['Test warning'],
      })

      const result = provider.testParseResponse(response, context)

      expect(result.provider).toBe('test')
      expect(result.summary).toBe('Analysis complete')
      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0].action).toBe('update')
      expect(result.recommendations[0].riskLevel).toBe('low')
      expect(result.warnings).toContain('Test warning')
    })

    it('should handle JSON with extra text around it', () => {
      const context = createMockContext()
      const response = 'Here is my analysis:\n{"summary": "Done", "recommendations": []}\nThanks!'

      const result = provider.testParseResponse(response, context)

      expect(result.summary).toBe('Done')
    })

    it('should normalize action values', () => {
      const context = createMockContext()
      const response = JSON.stringify({
        summary: 'Test',
        recommendations: [
          { package: 'test1', action: 'UPDATE' },
          { package: 'test2', action: 'SKIP' },
          { package: 'test3', action: 'REVIEW' },
          { package: 'test4', action: 'DEFER' },
          { package: 'test5', action: 'invalid' },
        ],
      })

      const result = provider.testParseResponse(response, context)

      expect(result.recommendations[0].action).toBe('update')
      expect(result.recommendations[1].action).toBe('skip')
      expect(result.recommendations[2].action).toBe('review')
      expect(result.recommendations[3].action).toBe('defer')
      expect(result.recommendations[4].action).toBe('review') // default
    })

    it('should normalize risk level values', () => {
      const context = createMockContext()
      const response = JSON.stringify({
        summary: 'Test',
        recommendations: [
          { package: 'test1', riskLevel: 'LOW' },
          { package: 'test2', riskLevel: 'MEDIUM' },
          { package: 'test3', riskLevel: 'HIGH' },
          { package: 'test4', riskLevel: 'CRITICAL' },
          { package: 'test5', riskLevel: 'invalid' },
        ],
      })

      const result = provider.testParseResponse(response, context)

      expect(result.recommendations[0].riskLevel).toBe('low')
      expect(result.recommendations[1].riskLevel).toBe('medium')
      expect(result.recommendations[2].riskLevel).toBe('high')
      expect(result.recommendations[3].riskLevel).toBe('critical')
      expect(result.recommendations[4].riskLevel).toBe('medium') // default
    })

    it('should create fallback result when JSON is invalid', () => {
      const context = createMockContext()
      const response = 'This is not valid JSON at all'

      const result = provider.testParseResponse(response, context)

      expect(result.summary).toBe('Analysis completed with parsing issues')
      expect(result.confidence).toBe(0.3)
      expect(result.recommendations[0].action).toBe('review')
    })

    it('should calculate confidence based on response quality', () => {
      const context = createMockContext()
      const completeResponse = JSON.stringify({
        summary: 'Complete analysis',
        recommendations: [
          {
            package: 'lodash',
            action: 'update',
            reason: 'This is a detailed reason for the recommendation',
            riskLevel: 'low',
            breakingChanges: ['change1'],
          },
        ],
      })

      const result = provider.testParseResponse(completeResponse, context)

      expect(result.confidence).toBeGreaterThan(0.5)
    })
  })

  describe('createFallbackResult', () => {
    it('should create fallback result with review action for all packages', () => {
      const context = createMockContext({
        packages: [
          { name: 'pkg1', currentVersion: '1.0.0', targetVersion: '2.0.0', updateType: 'major' },
          { name: 'pkg2', currentVersion: '1.0.0', targetVersion: '1.1.0', updateType: 'minor' },
        ],
      })

      const result = provider.testCreateFallbackResult(context, 'raw response')

      expect(result.recommendations).toHaveLength(2)
      expect(result.recommendations.every((r) => r.action === 'review')).toBe(true)
      expect(result.confidence).toBe(0.3)
      expect(result.details).toBe('raw response')
    })
  })
})
