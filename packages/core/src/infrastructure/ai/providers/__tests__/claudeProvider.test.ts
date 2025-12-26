/**
 * Claude AI Provider Tests
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

import { ClaudeProvider } from '../claudeProvider.js'

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

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider

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
    vi.useFakeTimers({ shouldAdvanceTime: true })
    provider = new ClaudeProvider()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  describe('constructor', () => {
    it('should use default options', () => {
      const p = new ClaudeProvider()
      expect(p.name).toBe('claude')
      expect(p.priority).toBe(100)
      expect(p.capabilities).toContain('impact')
    })

    it('should accept custom options', () => {
      const p = new ClaudeProvider({
        model: 'claude-opus-4-20250514',
        dangerouslySkipPermissions: false,
        timeout: 60000,
      })
      expect(p.name).toBe('claude')
    })
  })

  describe('isAvailable', () => {
    it('should return true when claude CLI is found via which', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/claude')

      const result = await provider.isAvailable()

      expect(result).toBe(true)
      expect(mockWhichCommand).toHaveBeenCalledWith('claude', expect.any(Number))
    })

    it('should return true when claude CLI is found via version check', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue('1.0.0')

      const result = await provider.isAvailable()

      expect(result).toBe(true)
    })

    it('should return false when claude CLI is not found', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue(null)

      const result = await provider.isAvailable()

      expect(result).toBe(false)
    })

    it('should cache availability result', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/claude')

      await provider.isAvailable()
      await provider.isAvailable()

      expect(mockWhichCommand).toHaveBeenCalledTimes(1)
    })

    it('should handle errors gracefully', async () => {
      mockWhichCommand.mockRejectedValue(new Error('Command failed'))

      const result = await provider.isAvailable()

      expect(result).toBe(false)
    })
  })

  describe('getInfo', () => {
    it('should return provider info when available', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/claude')
      mockGetCommandVersion.mockResolvedValue('1.2.3')

      const info = await provider.getInfo()

      expect(info.name).toBe('claude')
      expect(info.available).toBe(true)
      expect(info.version).toBe('1.2.3')
      expect(info.path).toBe('/usr/local/bin/claude')
      expect(info.priority).toBe(100)
      expect(info.capabilities).toContain('impact')
    })

    it('should return unavailable info when not available', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue(null)

      const info = await provider.getInfo()

      expect(info.name).toBe('claude')
      expect(info.available).toBe(false)
      expect(info.version).toBeUndefined()
      expect(info.priority).toBe(0)
    })

    it('should cache info result', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/claude')
      mockGetCommandVersion.mockResolvedValue('1.0.0')

      await provider.getInfo()
      await provider.getInfo()

      // Second call should use cache
      expect(mockGetCommandVersion).toHaveBeenCalledTimes(1)
    })
  })

  describe('analyze', () => {
    it('should throw error when not available', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue(null)

      const context = createMockContext()

      await expect(provider.analyze(context)).rejects.toThrow('Claude CLI is not available')
    })

    it('should execute claude command and parse response', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/claude')

      const jsonResponse = JSON.stringify({
        summary: 'Safe to update',
        recommendations: [
          {
            package: 'lodash',
            currentVersion: '4.17.20',
            targetVersion: '4.17.21',
            action: 'update',
            reason: 'Patch update with bug fixes',
            riskLevel: 'low',
          },
        ],
      })

      mockSpawn.mockReturnValue(createMockChildProcess(jsonResponse, '', 0, 10))

      const context = createMockContext()
      const result = await provider.analyze(context)

      expect(result.provider).toBe('claude')
      expect(result.analysisType).toBe('impact')
      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0].action).toBe('update')
    })

    it('should return degraded result on error', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/claude')

      // Create error process that exits immediately with error
      mockSpawn.mockImplementation(() => {
        const proc = createMockChildProcess('', 'Error occurred', 1, 5)
        return proc
      })

      const p = new ClaudeProvider({ maxRetries: 1, timeout: 1000 })
      const context = createMockContext()
      const result = await p.analyze(context)

      expect(result.provider).toBe('claude')
      expect(result.confidence).toBe(0.1)
      expect(result.recommendations[0].action).toBe('review')
      expect(result.warnings).toHaveLength(1)
    }, 10000)

    it('should include correct arguments in spawn call', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/claude')

      const jsonResponse = JSON.stringify({ summary: 'Test', recommendations: [] })
      mockSpawn.mockReturnValue(createMockChildProcess(jsonResponse, '', 0, 10))

      const context = createMockContext()
      await provider.analyze(context)

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '--dangerously-skip-permissions',
          '--model',
          'claude-sonnet-4-20250514',
          '--output-format',
          'text',
          '-p',
        ]),
        expect.any(Object)
      )
    })
  })

  describe('clearCache', () => {
    it('should clear cached availability and info', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/claude')
      mockGetCommandVersion.mockResolvedValue('1.0.0')

      // First call - should cache
      await provider.isAvailable()

      // Clear cache
      provider.clearCache()

      // Second call - should fetch again
      await provider.isAvailable()

      // whichCommand called twice: once before clear, once after
      expect(mockWhichCommand).toHaveBeenCalledTimes(2)
    })
  })

  describe('buildPrompt', () => {
    it('should include Claude-specific instructions', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/claude')

      let capturedArgs: string[] = []
      mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
        capturedArgs = args
        return createMockChildProcess('{"summary": "test", "recommendations": []}', '', 0, 10)
      })

      const context = createMockContext()
      await provider.analyze(context)

      // The prompt should be the last argument
      const prompt = capturedArgs[capturedArgs.length - 1]
      expect(prompt).toContain('Be concise')
      expect(prompt).toContain('pnpm catalog context')
    })
  })
})
