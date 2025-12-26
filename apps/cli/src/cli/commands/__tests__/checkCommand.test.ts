/**
 * Check Command Tests
 */

import type { CatalogUpdateService, OutdatedReport } from '@pcu/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    loadConfig: vi.fn(),
    CommandExitError: MockCommandExitError,
  }
})

const formatterMocks = vi.hoisted(() => ({
  formatOutdatedReport: vi.fn().mockReturnValue('Formatted output'),
}))

// Mock @pcu/utils - include CommandExitError for instanceof checks
vi.mock('@pcu/utils', () => ({
  CommandExitError: mocks.CommandExitError,
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  Logger: {
    setGlobalLevel: vi.fn(),
  },
  ConfigLoader: {
    loadConfig: mocks.loadConfig,
  },
  t: (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key} ${JSON.stringify(params)}`
    }
    return key
  },
}))

// Mock OutputFormatter - needs to be a proper class constructor
vi.mock('../../formatters/outputFormatter.js', () => {
  return {
    OutputFormatter: class MockOutputFormatter {
      formatOutdatedReport = formatterMocks.formatOutdatedReport
      formatUpdatePlan = vi.fn()
      formatUpdateResult = vi.fn()
      formatSecurityReport = vi.fn()
      formatImpactAnalysis = vi.fn()
    },
  }
})

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
    iconWarning: (text: string) => `[warning]${text}`,
    muted: (text: string) => `[muted]${text}`,
    error: (text: string) => `[error]${text}`,
  },
}))

// Create a chainable chalk mock that supports all color combinations
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

// Mock chalk with chainable functions
vi.mock('chalk', () => ({
  default: createChalkMock(),
}))

// Import after mock setup
const { CheckCommand } = await import('../checkCommand.js')

describe('CheckCommand', () => {
  let command: InstanceType<typeof CheckCommand>
  let mockCatalogUpdateService: CatalogUpdateService
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let processExitSpy: ReturnType<typeof vi.spyOn>

  const mockOutdatedReport: OutdatedReport = {
    hasUpdates: true,
    totalOutdated: 2,
    catalogs: [
      {
        catalogName: 'default',
        totalPackages: 10,
        outdatedCount: 2,
        outdatedDependencies: [
          {
            packageName: 'lodash',
            currentVersion: '4.17.20',
            latestVersion: '4.17.21',
            updateType: 'patch',
            isSecurityUpdate: false,
            changelog: null,
          },
          {
            packageName: 'typescript',
            currentVersion: '5.0.0',
            latestVersion: '5.3.0',
            updateType: 'minor',
            isSecurityUpdate: false,
            changelog: null,
          },
        ],
      },
    ],
    checkedAt: new Date(),
    options: {
      target: 'latest',
      includePrerelease: false,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up default mock return values for ConfigLoader
    mocks.loadConfig.mockReturnValue({
      defaults: {
        target: 'latest',
        format: 'table',
      },
      include: [],
      exclude: [],
    })

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    // Create mock catalog update service
    mockCatalogUpdateService = {
      checkOutdatedDependencies: vi.fn().mockResolvedValue(mockOutdatedReport),
      findCatalogForPackage: vi.fn(),
      analyzeImpact: vi.fn(),
      planUpdates: vi.fn(),
      executeUpdates: vi.fn(),
    } as unknown as CatalogUpdateService

    command = new CheckCommand(mockCatalogUpdateService)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
    vi.resetAllMocks()
  })

  describe('execute', () => {
    it('should check for outdated dependencies', async () => {
      try {
        await command.execute({})
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(0)
      }

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should use specified workspace path', async () => {
      try {
        await command.execute({ workspace: '/custom/workspace' })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          workspacePath: '/custom/workspace',
        })
      )
    })

    it('should filter by catalog name', async () => {
      try {
        await command.execute({ catalog: 'react17' })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          catalogName: 'react17',
        })
      )
    })

    it('should use specified target', async () => {
      try {
        await command.execute({ target: 'minor' })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'minor',
        })
      )
    })

    it('should include prerelease versions when specified', async () => {
      try {
        await command.execute({ prerelease: true })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          includePrerelease: true,
        })
      )
    })

    it('should apply include patterns', async () => {
      try {
        await command.execute({ include: ['lodash', 'react*'] })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          include: ['lodash', 'react*'],
        })
      )
    })

    it('should apply exclude patterns', async () => {
      try {
        await command.execute({ exclude: ['@types/*'] })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          exclude: ['@types/*'],
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
      // Verbose mode shows additional information
      const calls = consoleSpy.mock.calls.flat().join(' ')
      expect(calls).toContain('Workspace')
    })

    it('should handle error and exit with code 1', async () => {
      mockCatalogUpdateService.checkOutdatedDependencies = vi
        .fn()
        .mockRejectedValue(new Error('Check failed'))

      try {
        await command.execute({})
        expect.fail('Should have thrown CommandExitError')
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(1)
      }
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should show summary when no updates found', async () => {
      const noUpdatesReport: OutdatedReport = {
        hasUpdates: false,
        totalOutdated: 0,
        catalogs: [
          {
            catalogName: 'default',
            totalPackages: 10,
            outdatedCount: 0,
            outdatedDependencies: [],
          },
        ],
        checkedAt: new Date(),
        options: { target: 'latest', includePrerelease: false },
      }

      mockCatalogUpdateService.checkOutdatedDependencies = vi
        .fn()
        .mockResolvedValue(noUpdatesReport)

      try {
        await command.execute({})
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(0)
      }

      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('validateOptions', () => {
    it('should return no errors for valid options', () => {
      const errors = CheckCommand.validateOptions({
        format: 'json',
        target: 'minor',
      })

      expect(errors).toHaveLength(0)
    })

    it('should return error for invalid format', () => {
      const errors = CheckCommand.validateOptions({
        format: 'invalid' as never,
      })

      expect(errors).toContain('validation.invalidFormat')
    })

    it('should return error for invalid target', () => {
      const errors = CheckCommand.validateOptions({
        target: 'invalid' as never,
      })

      expect(errors).toContain('validation.invalidTarget')
    })

    it('should return error for empty include patterns', () => {
      const errors = CheckCommand.validateOptions({
        include: ['lodash', '   '],
      })

      expect(errors).toContain('validation.includePatternsEmpty')
    })

    it('should return error for empty exclude patterns', () => {
      const errors = CheckCommand.validateOptions({
        exclude: ['', '@types/*'],
      })

      expect(errors).toContain('validation.excludePatternsEmpty')
    })
  })

  describe('getHelpText', () => {
    it('should return help text with all options', () => {
      const helpText = CheckCommand.getHelpText()

      expect(helpText).toContain('Check for outdated catalog dependencies')
      expect(helpText).toContain('--workspace')
      expect(helpText).toContain('--catalog')
      expect(helpText).toContain('--format')
      expect(helpText).toContain('--target')
      expect(helpText).toContain('--prerelease')
      expect(helpText).toContain('--include')
      expect(helpText).toContain('--exclude')
    })
  })
})
