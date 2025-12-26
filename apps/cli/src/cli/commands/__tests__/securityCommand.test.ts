/**
 * Security Command Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutputFormatter } from '../../formatters/outputFormatter.js'

// Use vi.hoisted to ensure mocks are available during vi.mock hoisting
const mocks = vi.hoisted(() => {
  // Create a mock CommandExitError class for instanceof checks
  class MockCommandExitError extends Error {
    public readonly exitCode: number
    public readonly silent: boolean

    constructor(exitCode: number, message?: string, silent = false) {
      super(message || (exitCode === 0 ? 'Command completed successfully' : 'Command failed'))
      this.name = 'CommandExitError'
      this.exitCode = exitCode
      this.silent = silent
    }

    static success(message?: string): MockCommandExitError {
      return new MockCommandExitError(0, message, true)
    }

    static failure(message?: string): MockCommandExitError {
      return new MockCommandExitError(1, message)
    }

    static withCode(code: number, message?: string): MockCommandExitError {
      return new MockCommandExitError(code, message)
    }
  }

  return {
    spawnSync: vi.fn(),
    exec: vi.fn(
      (
        _cmd: string,
        callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
      ) => {
        callback(null, { stdout: '', stderr: '' })
      }
    ),
    pathExists: vi.fn(),
    formatSecurityReport: vi.fn().mockReturnValue('Formatted security report'),
    CommandExitError: MockCommandExitError,
  }
})

// Mock @pcu/utils - include CommandExitError for instanceof checks
vi.mock('@pcu/utils', () => ({
  CommandExitError: mocks.CommandExitError,
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  t: (key: string) => key,
}))

// Mock child_process
vi.mock('node:child_process', () => ({
  spawnSync: mocks.spawnSync,
  exec: mocks.exec,
}))

// Mock fs-extra
vi.mock('fs-extra', () => ({
  default: {
    pathExists: mocks.pathExists,
  },
  pathExists: mocks.pathExists,
}))

// Mock ProgressBar - needs to be a proper class constructor
vi.mock('../../formatters/progressBar.js', () => ({
  ProgressBar: class MockProgressBar {
    start = vi.fn()
    succeed = vi.fn()
    fail = vi.fn()
    stop = vi.fn()
    update = vi.fn()
  },
}))

// Mock ThemeManager and StyledText
vi.mock('../../themes/colorTheme.js', () => ({
  ThemeManager: {
    setTheme: vi.fn(),
    getTheme: vi.fn().mockReturnValue({
      major: (text: string) => text,
      minor: (text: string) => text,
      patch: (text: string) => text,
    }),
  },
  StyledText: {
    iconAnalysis: (text: string) => `[analysis]${text}`,
    iconSuccess: (text: string) => `[success]${text}`,
    iconInfo: (text: string) => `[info]${text}`,
    iconError: (text: string) => `[error]${text}`,
    iconSecurity: (text: string) => `[security]${text}`,
    iconUpdate: (text: string) => `[update]${text}`,
    iconWarning: (text?: string) => (text ? `[warning]${text}` : '[warning]'),
    muted: (text: string) => `[muted]${text}`,
    error: (text: string) => `[error]${text}`,
  },
}))

// Create a chainable chalk mock
const createChalkMock = () => {
  const createColorFn = (text: string) => text
  const colorFn = Object.assign(createColorFn, {
    bold: Object.assign((text: string) => text, {
      cyan: (text: string) => text,
      white: (text: string) => text,
    }),
    dim: Object.assign((text: string) => text, {
      white: (text: string) => text,
    }),
    red: Object.assign((text: string) => text, {
      bold: (text: string) => text,
    }),
    green: (text: string) => text,
    yellow: (text: string) => text,
    blue: (text: string) => text,
    gray: (text: string) => text,
    cyan: (text: string) => text,
    white: (text: string) => text,
  })
  return colorFn
}

// Mock chalk
vi.mock('chalk', () => ({
  default: createChalkMock(),
}))

// Import after mock setup
const { SecurityCommand } = await import('../securityCommand.js')

describe('SecurityCommand', () => {
  let command: InstanceType<typeof SecurityCommand>
  let mockOutputFormatter: OutputFormatter
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let processExitSpy: ReturnType<typeof vi.spyOn>

  const mockNpmAuditResult = {
    vulnerabilities: {
      'example-vuln-1': {
        name: 'vulnerable-package',
        severity: 'high',
        title: 'Remote Code Execution',
        url: 'https://npmjs.com/advisories/1234',
        range: '>=1.0.0 <2.0.0',
        fixAvailable: true,
        via: [{ source: '1234', name: 'vulnerable-package' }],
        cwe: ['CWE-94'],
        cve: ['CVE-2023-1234'],
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up default mock return values
    mocks.pathExists.mockResolvedValue(true)
    mocks.spawnSync.mockReturnValue({
      status: 1,
      stdout: JSON.stringify(mockNpmAuditResult),
      stderr: '',
      error: undefined,
    })

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    // Create mock output formatter using hoisted mock
    mockOutputFormatter = {
      formatSecurityReport: mocks.formatSecurityReport,
      formatOutdatedReport: vi.fn(),
      formatUpdateResult: vi.fn(),
      formatUpdatePlan: vi.fn(),
      formatImpactAnalysis: vi.fn(),
      formatJSON: vi.fn(),
      formatYAML: vi.fn(),
      formatTable: vi.fn(),
      formatMinimal: vi.fn(),
    } as unknown as OutputFormatter

    command = new SecurityCommand(mockOutputFormatter)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    processExitSpy.mockRestore()
    vi.resetAllMocks()
  })

  describe('execute', () => {
    it('should perform security scan', async () => {
      try {
        await command.execute({})
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mocks.spawnSync).toHaveBeenCalled()
      expect(mockOutputFormatter.formatSecurityReport).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should use specified workspace path', async () => {
      try {
        await command.execute({ workspace: '/custom/workspace' })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mocks.spawnSync).toHaveBeenCalledWith(
        'pnpm',
        expect.arrayContaining(['audit']),
        expect.objectContaining({
          cwd: '/custom/workspace',
        })
      )
    })

    it('should show verbose output when specified', async () => {
      try {
        await command.execute({ verbose: true })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(consoleSpy).toHaveBeenCalled()
      const calls = consoleSpy.mock.calls.flat().join(' ')
      expect(calls).toContain('Workspace')
    })

    it('should exit with code 1 when critical vulnerabilities found', async () => {
      mocks.spawnSync.mockReturnValue({
        status: 1,
        stdout: JSON.stringify({
          vulnerabilities: {
            'critical-vuln': {
              name: 'critical-package',
              severity: 'critical',
              title: 'Critical Issue',
              url: '',
              range: '*',
              fixAvailable: true,
            },
          },
        }),
        stderr: '',
        error: undefined,
      })

      try {
        await command.execute({})
        expect.fail('Should have thrown CommandExitError')
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(1)
      }
    })

    it('should exit with code 0 when no critical vulnerabilities found', async () => {
      mocks.spawnSync.mockReturnValue({
        status: 0,
        stdout: JSON.stringify({ vulnerabilities: {} }),
        stderr: '',
        error: undefined,
      })

      try {
        await command.execute({})
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(0)
      }
    })

    it('should handle error when package.json not found', async () => {
      mocks.pathExists.mockResolvedValue(false)

      try {
        await command.execute({})
        expect.fail('Should have thrown CommandExitError')
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(1)
      }
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should handle npm audit failure', async () => {
      mocks.spawnSync.mockReturnValue({
        status: 2,
        stdout: '',
        stderr: 'npm audit failed',
        error: undefined,
      })

      try {
        await command.execute({})
        expect.fail('Should have thrown CommandExitError')
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(1)
      }
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should filter vulnerabilities by severity', async () => {
      mocks.spawnSync.mockReturnValue({
        status: 1,
        stdout: JSON.stringify({
          vulnerabilities: {
            'low-vuln': {
              name: 'low-package',
              severity: 'low',
              title: 'Low Issue',
              range: '*',
              fixAvailable: false,
            },
            'high-vuln': {
              name: 'high-package',
              severity: 'high',
              title: 'High Issue',
              range: '*',
              fixAvailable: true,
            },
          },
        }),
        stderr: '',
        error: undefined,
      })

      try {
        await command.execute({ severity: 'high' })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mockOutputFormatter.formatSecurityReport).toHaveBeenCalledWith(
        expect.objectContaining({
          vulnerabilities: expect.arrayContaining([expect.objectContaining({ severity: 'high' })]),
        })
      )
    })

    it('should include dev dependencies when specified', async () => {
      try {
        await command.execute({ includeDev: true })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mocks.spawnSync).toHaveBeenCalledWith(
        'pnpm',
        expect.not.arrayContaining(['--omit=dev']),
        expect.any(Object)
      )
    })

    it('should warn when snyk not found', async () => {
      mocks.spawnSync.mockImplementation((cmd) => {
        if (cmd === 'snyk') {
          const error = new Error('ENOENT') as NodeJS.ErrnoException
          error.code = 'ENOENT'
          return { error, status: null, stdout: '', stderr: '' }
        }
        return {
          status: 0,
          stdout: JSON.stringify({ vulnerabilities: {} }),
          stderr: '',
          error: undefined,
        }
      })

      try {
        await command.execute({ snyk: true })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(consoleWarnSpy).toHaveBeenCalled()
    })
  })

  describe('validateOptions', () => {
    it('should return no errors for valid options', () => {
      const errors = SecurityCommand.validateOptions({
        format: 'json',
        severity: 'high',
      })

      expect(errors).toHaveLength(0)
    })

    it('should return error for invalid format', () => {
      const errors = SecurityCommand.validateOptions({
        format: 'invalid' as never,
      })

      expect(errors).toContain('validation.invalidFormat')
    })

    it('should return error for invalid severity', () => {
      const errors = SecurityCommand.validateOptions({
        severity: 'invalid' as never,
      })

      expect(errors).toContain('validation.invalidSeverity')
    })
  })

  describe('getHelpText', () => {
    it('should return help text with all options', () => {
      const helpText = SecurityCommand.getHelpText()

      expect(helpText).toContain('Security vulnerability scanning')
      expect(helpText).toContain('--workspace')
      expect(helpText).toContain('--format')
      expect(helpText).toContain('--audit')
      expect(helpText).toContain('--fix-vulns')
      expect(helpText).toContain('--severity')
      expect(helpText).toContain('--include-dev')
      expect(helpText).toContain('--snyk')
    })
  })
})
