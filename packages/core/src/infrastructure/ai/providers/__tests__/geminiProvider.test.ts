/**
 * Gemini AI Provider Tests
 */

import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisContext } from '../../../../domain/interfaces/aiProvider.js'

// Create mock functions using vi.hoisted
const { mockWhichCommand, mockGetCommandVersion, mockSpawn } = vi.hoisted(() => ({
  mockWhichCommand: vi.fn(),
  mockGetCommandVersion: vi.fn(),
  mockSpawn: vi.fn(),
}))

// Mock @pcu/utils
vi.mock('@pcu/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('@pcu/utils')>()
  return {
    ...original,
    whichCommand: mockWhichCommand,
    getCommandVersion: mockGetCommandVersion,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

// Mock child_process spawn
vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
  exec: vi.fn(),
}))

import { GeminiProvider } from '../geminiProvider.js'

// Helper to create mock child process
function createMockChildProcess(
  stdout: string = '',
  stderr: string = '',
  exitCode: number = 0,
  delay: number = 0
): ChildProcess {
  const mockProcess = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter
    stderr: EventEmitter
    stdin: { end: () => void }
    kill: () => void
  }

  mockProcess.stdout = new EventEmitter()
  mockProcess.stderr = new EventEmitter()
  mockProcess.stdin = { end: vi.fn() }
  mockProcess.kill = vi.fn()

  setTimeout(() => {
    if (stdout) {
      mockProcess.stdout.emit('data', Buffer.from(stdout))
    }
    if (stderr) {
      mockProcess.stderr.emit('data', Buffer.from(stderr))
    }
    setTimeout(() => {
      mockProcess.emit('close', exitCode)
    }, delay)
  }, delay)

  return mockProcess
}

describe('GeminiProvider', () => {
  let provider: GeminiProvider

  const createMockContext = (overrides: Partial<AnalysisContext> = {}): AnalysisContext => ({
    packages: [
      {
        name: 'react',
        currentVersion: '18.0.0',
        targetVersion: '18.2.0',
        updateType: 'minor',
      },
    ],
    workspaceInfo: {
      name: 'test-workspace',
      packageCount: 10,
      catalogCount: 3,
    },
    analysisType: 'impact',
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    provider = new GeminiProvider()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  describe('constructor', () => {
    it('should use default options', () => {
      const p = new GeminiProvider()
      expect(p.name).toBe('gemini')
      expect(p.priority).toBe(80)
      expect(p.capabilities).toContain('impact')
      expect(p.capabilities).toContain('security')
    })

    it('should accept custom options', () => {
      const p = new GeminiProvider({
        model: 'gemini-1.5-pro',
        maxTokens: 8192,
        sandbox: false,
        timeout: 120000,
      })
      expect(p.name).toBe('gemini')
    })
  })

  describe('isAvailable', () => {
    it('should return true when gemini CLI is found via which', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/gemini')

      const result = await provider.isAvailable()

      expect(result).toBe(true)
      expect(mockWhichCommand).toHaveBeenCalledWith('gemini', expect.any(Number))
    })

    it('should check for alternative gemini-cli command', async () => {
      mockWhichCommand.mockImplementation((cmd: string) => {
        if (cmd === 'gemini') return Promise.resolve(null)
        if (cmd === 'gemini-cli') return Promise.resolve('/usr/local/bin/gemini-cli')
        return Promise.resolve(null)
      })

      const result = await provider.isAvailable()

      expect(result).toBe(true)
      expect(mockWhichCommand).toHaveBeenCalledWith('gemini-cli', expect.any(Number))
    })

    it('should return true when gemini is found via version check', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue('0.5.0')

      const result = await provider.isAvailable()

      expect(result).toBe(true)
    })

    it('should return false when gemini CLI is not found', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue(null)

      const result = await provider.isAvailable()

      expect(result).toBe(false)
    })

    it('should cache availability result', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/gemini')

      await provider.isAvailable()
      await provider.isAvailable()
      await provider.isAvailable()

      expect(mockWhichCommand).toHaveBeenCalledTimes(1)
    })

    it('should handle errors gracefully', async () => {
      mockWhichCommand.mockRejectedValue(new Error('Network error'))

      const result = await provider.isAvailable()

      expect(result).toBe(false)
    })
  })

  describe('getInfo', () => {
    it('should return provider info when available', async () => {
      mockWhichCommand.mockResolvedValue('/opt/gemini/bin/gemini')
      mockGetCommandVersion.mockResolvedValue('0.6.1')

      const info = await provider.getInfo()

      expect(info.name).toBe('gemini')
      expect(info.available).toBe(true)
      expect(info.version).toBe('0.6.1')
      expect(info.path).toBe('/opt/gemini/bin/gemini')
      expect(info.priority).toBe(80)
      expect(info.capabilities).toContain('compatibility')
    })

    it('should return unavailable info when not available', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue(null)

      const info = await provider.getInfo()

      expect(info.name).toBe('gemini')
      expect(info.available).toBe(false)
      expect(info.version).toBeUndefined()
      expect(info.priority).toBe(0)
    })

    it('should cache info result', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/gemini')
      mockGetCommandVersion.mockResolvedValue('0.6.0')

      await provider.getInfo()
      await provider.getInfo()

      expect(mockGetCommandVersion).toHaveBeenCalledTimes(1)
    })
  })

  describe('analyze', () => {
    it('should throw error when not available', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue(null)

      const context = createMockContext()

      await expect(provider.analyze(context)).rejects.toThrow('Gemini CLI is not available')
    })

    it('should execute gemini command and parse response', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/gemini')

      const jsonResponse = JSON.stringify({
        summary: 'Minor update looks safe',
        recommendations: [
          {
            package: 'react',
            currentVersion: '18.0.0',
            targetVersion: '18.2.0',
            action: 'update',
            reason: 'New features and bug fixes',
            riskLevel: 'low',
            breakingChanges: [],
          },
        ],
      })

      mockSpawn.mockReturnValue(createMockChildProcess(jsonResponse, '', 0, 10))

      const context = createMockContext()
      const result = await provider.analyze(context)

      expect(result.provider).toBe('gemini')
      expect(result.analysisType).toBe('impact')
      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0].action).toBe('update')
    })

    it('should return degraded result on error', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/gemini')

      const errorProcess = createMockChildProcess('', 'API quota exceeded', 1, 10)
      mockSpawn.mockReturnValue(errorProcess)

      const p = new GeminiProvider({ maxRetries: 1, timeout: 1000 })
      const context = createMockContext()
      const result = await p.analyze(context)

      expect(result.provider).toBe('gemini')
      expect(result.confidence).toBe(0.1)
      expect(result.recommendations[0].action).toBe('review')
      expect(result.warnings[0]).toContain('Gemini CLI error')
    }, 10000)

    it('should include sandbox flag by default', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/gemini')

      const jsonResponse = JSON.stringify({ summary: 'Test', recommendations: [] })
      mockSpawn.mockReturnValue(createMockChildProcess(jsonResponse, '', 0, 10))

      const context = createMockContext()
      await provider.analyze(context)

      expect(mockSpawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['--sandbox']),
        expect.any(Object)
      )
    })

    it('should include model and max tokens in arguments', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/gemini')

      const jsonResponse = JSON.stringify({ summary: 'Test', recommendations: [] })
      mockSpawn.mockReturnValue(createMockChildProcess(jsonResponse, '', 0, 10))

      const context = createMockContext()
      await provider.analyze(context)

      expect(mockSpawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['--model', 'gemini-2.5-pro', '--max-output-tokens', '4096']),
        expect.any(Object)
      )
    })
  })

  describe('clearCache', () => {
    it('should clear cached availability and info', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/gemini')
      mockGetCommandVersion.mockResolvedValue('0.6.0')

      await provider.isAvailable()

      provider.clearCache()

      await provider.isAvailable()

      expect(mockWhichCommand).toHaveBeenCalledTimes(2)
    })
  })

  describe('buildPrompt', () => {
    it('should include Gemini-specific instructions', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/gemini')

      let capturedArgs: string[] = []
      mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
        capturedArgs = args
        return createMockChildProcess('{"summary": "test", "recommendations": []}', '', 0, 10)
      })

      const context = createMockContext()
      await provider.analyze(context)

      // Find the prompt argument (after -p flag)
      const promptIndex = capturedArgs.indexOf('-p')
      const prompt = capturedArgs[promptIndex + 1]

      expect(prompt).toContain('comprehensive analysis')
      expect(prompt).toContain('pnpm workspace catalog')
      expect(prompt).toContain('valid JSON')
    })
  })
})
