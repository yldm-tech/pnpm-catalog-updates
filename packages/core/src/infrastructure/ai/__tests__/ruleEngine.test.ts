/**
 * Rule Engine Tests
 */

import { describe, expect, it } from 'vitest'
import type { AnalysisContext, PackageUpdateInfo } from '../../../domain/interfaces/aiProvider.js'
import { RuleEngine } from '../fallback/ruleEngine.js'

describe('RuleEngine', () => {
  const ruleEngine = new RuleEngine()

  const createContext = (
    packages: Partial<PackageUpdateInfo>[],
    analysisType: AnalysisContext['analysisType'] = 'impact'
  ): AnalysisContext => ({
    packages: packages.map((pkg) => ({
      name: pkg.name ?? 'test-package',
      currentVersion: pkg.currentVersion ?? '1.0.0',
      targetVersion: pkg.targetVersion ?? '1.1.0',
      updateType: pkg.updateType ?? 'minor',
      catalogName: pkg.catalogName,
    })),
    workspaceInfo: {
      name: 'test-workspace',
      path: '/test/path',
      packageCount: 5,
      catalogCount: 1,
    },
    analysisType,
  })

  describe('analyze', () => {
    it('should return result with rule-engine provider', () => {
      const context = createContext([{ name: 'lodash', updateType: 'patch' }])
      const result = ruleEngine.analyze(context)

      expect(result.provider).toBe('rule-engine')
      expect(result.analysisType).toBe('impact')
    })

    it('should recommend update for patch versions', () => {
      const context = createContext([
        {
          name: 'lodash',
          currentVersion: '4.17.20',
          targetVersion: '4.17.21',
          updateType: 'patch',
        },
      ])
      const result = ruleEngine.analyze(context)

      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0]?.action).toBe('update')
      expect(result.recommendations[0]?.riskLevel).toBe('low')
    })

    it('should recommend review for major versions', () => {
      const context = createContext([
        { name: 'react', currentVersion: '17.0.0', targetVersion: '18.0.0', updateType: 'major' },
      ])
      const result = ruleEngine.analyze(context)

      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0]?.action).toBe('review')
      expect(result.recommendations[0]?.riskLevel).toBe('high')
    })

    it('should recommend update for minor versions', () => {
      const context = createContext([
        { name: 'axios', currentVersion: '1.5.0', targetVersion: '1.6.0', updateType: 'minor' },
      ])
      const result = ruleEngine.analyze(context)

      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0]?.action).toBe('update')
      // Small minor jumps have low risk
      expect(result.recommendations[0]?.riskLevel).toBe('low')
    })

    it('should handle prerelease versions with high risk', () => {
      const context = createContext([
        {
          name: 'next',
          currentVersion: '14.0.0',
          targetVersion: '15.0.0-canary.1',
          updateType: 'prerelease',
        },
      ])
      const result = ruleEngine.analyze(context)

      expect(result.recommendations).toHaveLength(1)
      // Prerelease gets 'update' action unless it's also major + high risk
      expect(result.recommendations[0]?.action).toBe('update')
      expect(result.recommendations[0]?.riskLevel).toBe('high')
    })

    it('should handle multiple packages', () => {
      const context = createContext([
        { name: 'lodash', updateType: 'patch' },
        { name: 'react', updateType: 'major' },
        { name: 'axios', updateType: 'minor' },
      ])
      const result = ruleEngine.analyze(context)

      expect(result.recommendations).toHaveLength(3)
    })

    it('should generate appropriate summary', () => {
      const context = createContext([
        { name: 'lodash', updateType: 'patch' },
        { name: 'react', updateType: 'major' },
      ])
      const result = ruleEngine.analyze(context)

      // Summary format: "X package(s) ready to update. X package(s) need review. X high-risk update(s) detected"
      expect(result.summary).toContain('package(s)')
      // Major updates need review
      expect(result.summary).toContain('need review')
    })

    it('should have low confidence score', () => {
      const context = createContext([{ name: 'test', updateType: 'patch' }])
      const result = ruleEngine.analyze(context)

      // Rule engine should have lower confidence than AI
      expect(result.confidence).toBeLessThanOrEqual(0.7)
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('should include timestamp', () => {
      const context = createContext([{ name: 'test', updateType: 'patch' }])
      const result = ruleEngine.analyze(context)

      expect(result.timestamp).toBeInstanceOf(Date)
    })

    it('should handle security analysis type', () => {
      const context = createContext([{ name: 'test', updateType: 'patch' }], 'security')
      const result = ruleEngine.analyze(context)

      expect(result.analysisType).toBe('security')
    })

    it('should handle compatibility analysis type', () => {
      const context = createContext([{ name: 'test', updateType: 'patch' }], 'compatibility')
      const result = ruleEngine.analyze(context)

      expect(result.analysisType).toBe('compatibility')
    })

    it('should handle recommend analysis type', () => {
      const context = createContext([{ name: 'test', updateType: 'patch' }], 'recommend')
      const result = ruleEngine.analyze(context)

      expect(result.analysisType).toBe('recommend')
    })
  })

  describe('edge cases', () => {
    it('should handle empty packages array', () => {
      const context = createContext([])
      const result = ruleEngine.analyze(context)

      expect(result.recommendations).toHaveLength(0)
      expect(result.summary).toBe('No updates to analyze')
    })

    it('should handle packages with catalog name', () => {
      const context = createContext([
        { name: '@scope/package', updateType: 'minor', catalogName: 'default' },
      ])
      const result = ruleEngine.analyze(context)

      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0]?.package).toBe('@scope/package')
    })
  })
})
