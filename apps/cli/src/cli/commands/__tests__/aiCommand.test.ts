/**
 * AI Command Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted to ensure mocks are available during vi.mock hoisting
const mocks = vi.hoisted(() => ({
  analyzeUpdates: vi.fn(),
  getDetectionSummary: vi.fn(),
  detectAvailableProviders: vi.fn(),
  getBestProvider: vi.fn(),
  cacheClear: vi.fn(),
  cacheGetStats: vi.fn(),
}))

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    gray: (text: string) => text,
    red: (text: string) => text,
    blue: (text: string) => text,
    yellow: (text: string) => text,
    green: (text: string) => text,
    cyan: (text: string) => text,
  },
}))

// Mock @pcu/core - use class syntax for proper constructor mocking
vi.mock('@pcu/core', () => {
  // Create a proper class mock for AIDetector
  const AIDetectorMock = vi.fn(function (this: Record<string, unknown>) {
    this.getDetectionSummary = mocks.getDetectionSummary
    this.detectAvailableProviders = mocks.detectAvailableProviders
    this.getBestProvider = mocks.getBestProvider
  })

  // Create a proper class mock for AIAnalysisService
  const AIAnalysisServiceMock = vi.fn(function (this: Record<string, unknown>) {
    this.analyzeUpdates = mocks.analyzeUpdates
  })

  return {
    AIAnalysisService: AIAnalysisServiceMock,
    AIDetector: AIDetectorMock,
    analysisCache: {
      clear: mocks.cacheClear,
      getStats: mocks.cacheGetStats,
    },
  }
})

// Import after mock setup
const { AiCommand } = await import('../aiCommand.js')

describe('AiCommand', () => {
  let command: InstanceType<typeof AiCommand>
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up default mock return values
    mocks.analyzeUpdates.mockResolvedValue({
      provider: 'rule-engine',
      confidence: 0.85,
      summary: 'Test analysis completed successfully',
    })
    mocks.getDetectionSummary.mockResolvedValue('AI Provider Summary:\n  - Claude: Available')
    mocks.detectAvailableProviders.mockResolvedValue([
      { name: 'Claude', available: true, priority: 1, path: '/usr/bin/claude' },
      { name: 'Gemini', available: false, priority: 2 },
      { name: 'Codex', available: false, priority: 3 },
    ])
    mocks.getBestProvider.mockResolvedValue({ name: 'Claude', available: true })
    mocks.cacheGetStats.mockReturnValue({
      totalEntries: 10,
      hits: 8,
      misses: 2,
      hitRate: 0.8,
    })

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    command = new AiCommand()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    vi.resetAllMocks()
  })

  describe('execute', () => {
    it('should show status by default', async () => {
      await command.execute({})

      expect(consoleSpy).toHaveBeenCalled()
      expect(mocks.getDetectionSummary).toHaveBeenCalled()
      expect(mocks.detectAvailableProviders).toHaveBeenCalled()
    })

    it('should clear cache when --clear-cache flag is set', async () => {
      await command.execute({ clearCache: true })

      expect(mocks.cacheClear).toHaveBeenCalled()
      const calls = consoleSpy.mock.calls.flat().join(' ')
      expect(calls).toContain('cache cleared')
    })

    it('should show cache stats when --cache-stats flag is set', async () => {
      await command.execute({ cacheStats: true })

      expect(mocks.cacheGetStats).toHaveBeenCalled()
      const calls = consoleSpy.mock.calls.flat().join(' ')
      expect(calls).toContain('Cache Statistics')
      expect(calls).toContain('10') // totalEntries
      expect(calls).toContain('8') // hits
      expect(calls).toContain('2') // misses
    })

    it('should run test when --test flag is set', async () => {
      await command.execute({ test: true })

      const calls = consoleSpy.mock.calls.flat().join(' ')
      expect(calls).toContain('Testing AI analysis')
    })

    it('should show provider details in status', async () => {
      await command.execute({ status: true })

      expect(mocks.detectAvailableProviders).toHaveBeenCalled()
      const calls = consoleSpy.mock.calls.flat().join(' ')
      expect(calls).toContain('Claude')
    })

    it('should show best provider when available', async () => {
      await command.execute({})

      expect(mocks.getBestProvider).toHaveBeenCalled()
      const calls = consoleSpy.mock.calls.flat().join(' ')
      expect(calls).toContain('Best available provider')
    })
  })

  describe('getHelpText', () => {
    it('should return help text with all options', () => {
      const helpText = AiCommand.getHelpText()

      expect(helpText).toContain('Check AI provider status')
      expect(helpText).toContain('--status')
      expect(helpText).toContain('--test')
      expect(helpText).toContain('--cache-stats')
      expect(helpText).toContain('--clear-cache')
    })
  })
})
