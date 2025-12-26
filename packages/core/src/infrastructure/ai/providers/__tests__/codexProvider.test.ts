/**
 * Codex AI Provider Tests
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

import { CodexProvider } from '../codexProvider.js'

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

describe('CodexProvider', () => {
  let provider: CodexProvider

  const createMockContext = (overrides: Partial<AnalysisContext> = {}): AnalysisContext => ({
    packages: [
      {
        name: 'typescript',
        currentVersion: '5.0.0',
        targetVersion: '5.3.0',
        updateType: 'minor',
      },
    ],
    workspaceInfo: {
      name: 'test-workspace',
      packageCount: 8,
      catalogCount: 2,
    },
    analysisType: 'compatibility',
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    provider = new CodexProvider()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  describe('constructor', () => {
    it('should use default options', () => {
      const p = new CodexProvider()
      expect(p.name).toBe('codex')
      expect(p.priority).toBe(60)
      expect(p.capabilities).toContain('impact')
      expect(p.capabilities).toContain('recommend')
    })

    it('should accept custom options', () => {
      const p = new CodexProvider({
        model: 'gpt-4o',
        maxTokens: 8192,
        approvalMode: 'suggest',
        timeout: 180000,
      })
      expect(p.name).toBe('codex')
    })
  })

  describe('isAvailable', () => {
    it('should return true when codex CLI is found via which', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')

      const result = await provider.isAvailable()

      expect(result).toBe(true)
      expect(mockWhichCommand).toHaveBeenCalledWith('codex', expect.any(Number))
    })

    it('should check for alternative openai-codex command', async () => {
      mockWhichCommand.mockImplementation((cmd: string) => {
        if (cmd === 'codex') return Promise.resolve(null)
        if (cmd === 'openai-codex') return Promise.resolve('/usr/local/bin/openai-codex')
        return Promise.resolve(null)
      })

      const result = await provider.isAvailable()

      expect(result).toBe(true)
      expect(mockWhichCommand).toHaveBeenCalledWith('openai-codex', expect.any(Number))
    })

    it('should return true when codex is found via version check', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue('1.0.0')

      const result = await provider.isAvailable()

      expect(result).toBe(true)
    })

    it('should return false when codex CLI is not found', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue(null)

      const result = await provider.isAvailable()

      expect(result).toBe(false)
    })

    it('should cache availability result', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')

      await provider.isAvailable()
      await provider.isAvailable()
      await provider.isAvailable()

      expect(mockWhichCommand).toHaveBeenCalledTimes(1)
    })

    it('should handle errors gracefully', async () => {
      mockWhichCommand.mockRejectedValue(new Error('Permission denied'))

      const result = await provider.isAvailable()

      expect(result).toBe(false)
    })
  })

  describe('getInfo', () => {
    it('should return provider info when available', async () => {
      mockWhichCommand.mockResolvedValue('/home/user/.local/bin/codex')
      mockGetCommandVersion.mockResolvedValue('1.2.0')

      const info = await provider.getInfo()

      expect(info.name).toBe('codex')
      expect(info.available).toBe(true)
      expect(info.version).toBe('1.2.0')
      expect(info.path).toBe('/home/user/.local/bin/codex')
      expect(info.priority).toBe(60)
      expect(info.capabilities).toContain('security')
    })

    it('should return unavailable info when not available', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue(null)

      const info = await provider.getInfo()

      expect(info.name).toBe('codex')
      expect(info.available).toBe(false)
      expect(info.version).toBeUndefined()
      expect(info.priority).toBe(0)
    })

    it('should use alias as path when which fails but version succeeds', async () => {
      mockWhichCommand.mockResolvedValue(null)
      mockGetCommandVersion.mockResolvedValue('1.0.0')

      // Need to clear cache first
      provider.clearCache()
      mockWhichCommand.mockResolvedValue(null)

      const info = await provider.getInfo()

      expect(info.available).toBe(true)
      expect(info.path).toBe('alias')
    })

    it('should cache info result', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')
      mockGetCommandVersion.mockResolvedValue('1.0.0')

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

      await expect(provider.analyze(context)).rejects.toThrow('Codex CLI is not available')
    })

    it('should execute codex command and parse response', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')

      const jsonResponse = JSON.stringify({
        summary: 'TypeScript update analysis',
        recommendations: [
          {
            package: 'typescript',
            currentVersion: '5.0.0',
            targetVersion: '5.3.0',
            action: 'update',
            reason: 'New language features and improved type inference',
            riskLevel: 'medium',
            breakingChanges: ['Stricter type checking in some cases'],
          },
        ],
      })

      mockSpawn.mockReturnValue(createMockChildProcess(jsonResponse, '', 0, 10))

      const context = createMockContext()
      const result = await provider.analyze(context)

      expect(result.provider).toBe('codex')
      expect(result.analysisType).toBe('compatibility')
      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0].action).toBe('update')
      expect(result.recommendations[0].breakingChanges).toHaveLength(1)
    })

    it('should return degraded result on error', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')

      const errorProcess = createMockChildProcess('', 'Insufficient balance', 1, 10)
      mockSpawn.mockReturnValue(errorProcess)

      const p = new CodexProvider({ maxRetries: 1, timeout: 1000 })
      const context = createMockContext()
      const result = await p.analyze(context)

      expect(result.provider).toBe('codex')
      expect(result.confidence).toBe(0.1)
      expect(result.recommendations[0].action).toBe('review')
      expect(result.warnings[0]).toContain('Codex CLI error')
    }, 10000)

    it('should include approval-mode and quiet flags', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')

      const jsonResponse = JSON.stringify({ summary: 'Test', recommendations: [] })
      mockSpawn.mockReturnValue(createMockChildProcess(jsonResponse, '', 0, 10))

      const context = createMockContext()
      await provider.analyze(context)

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--approval-mode', 'full-auto', '--quiet']),
        expect.any(Object)
      )
    })

    it('should include model and max tokens in arguments', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')

      const jsonResponse = JSON.stringify({ summary: 'Test', recommendations: [] })
      mockSpawn.mockReturnValue(createMockChildProcess(jsonResponse, '', 0, 10))

      const context = createMockContext()
      await provider.analyze(context)

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--model', 'o3', '--max-tokens', '4096']),
        expect.any(Object)
      )
    })

    it('should handle security analysis type', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')

      const jsonResponse = JSON.stringify({
        summary: 'Security scan complete',
        recommendations: [
          {
            package: 'axios',
            action: 'update',
            reason: 'Fixes CVE-2023-1234',
            riskLevel: 'high',
            securityFixes: ['CVE-2023-1234'],
          },
        ],
      })

      mockSpawn.mockReturnValue(createMockChildProcess(jsonResponse, '', 0, 10))

      const context = createMockContext({
        analysisType: 'security',
        packages: [
          {
            name: 'axios',
            currentVersion: '0.21.0',
            targetVersion: '1.6.0',
            updateType: 'major',
          },
        ],
      })
      const result = await provider.analyze(context)

      expect(result.analysisType).toBe('security')
      expect(result.recommendations[0].securityFixes).toContain('CVE-2023-1234')
    })
  })

  describe('clearCache', () => {
    it('should clear cached availability and info', async () => {
      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')
      mockGetCommandVersion.mockResolvedValue('1.0.0')

      await provider.isAvailable()

      provider.clearCache()

      await provider.isAvailable()

      expect(mockWhichCommand).toHaveBeenCalledTimes(2)
    })
  })

  describe('buildPrompt', () => {
    it('should include Codex-specific instructions', async () => {
      vi.useRealTimers()

      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')

      let capturedArgs: string[] = []
      mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
        capturedArgs = args
        return createMockChildProcess('{"summary": "test", "recommendations": []}', '', 0, 10)
      })

      const context = createMockContext()
      await provider.analyze(context)

      // The prompt is the first argument for codex
      const prompt = capturedArgs[0]

      expect(prompt).toContain('Code Analysis Guidelines')
      expect(prompt).toContain('code-level impact')
      expect(prompt).toContain('TypeScript/JavaScript compatibility')
      expect(prompt).toContain('API signature changes')
    })
  })

  describe('custom approval modes', () => {
    it('should use suggest approval mode when configured', async () => {
      vi.useRealTimers()

      const p = new CodexProvider({ approvalMode: 'suggest' })

      mockWhichCommand.mockResolvedValue('/usr/local/bin/codex')

      const jsonResponse = JSON.stringify({ summary: 'Test', recommendations: [] })
      mockSpawn.mockReturnValue(createMockChildProcess(jsonResponse, '', 0, 10))

      const context = createMockContext()
      await p.analyze(context)

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--approval-mode', 'suggest']),
        expect.any(Object)
      )
    })
  })
})
