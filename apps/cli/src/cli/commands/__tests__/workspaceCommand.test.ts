/**
 * Workspace Command Tests
 */

import type { WorkspaceService } from '@pcu/core'
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
    bold: (text: string) => `[bold]${text}`,
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

// Mock OutputFormatter - needs to be a proper class constructor
vi.mock('../../formatters/outputFormatter.js', () => {
  return {
    OutputFormatter: class MockOutputFormatter {
      formatValidationReport = vi.fn().mockReturnValue('Formatted validation')
      formatWorkspaceStats = vi.fn().mockReturnValue('Formatted stats')
      formatMessage = vi.fn().mockImplementation((msg: string) => msg)
      formatOutdatedReport = vi.fn()
      formatUpdatePlan = vi.fn()
      formatUpdateResult = vi.fn()
      formatSecurityReport = vi.fn()
      formatImpactAnalysis = vi.fn()
    },
  }
})

// Import after mock setup
const { WorkspaceCommand } = await import('../workspaceCommand.js')

describe('WorkspaceCommand', () => {
  let command: InstanceType<typeof WorkspaceCommand>
  let mockWorkspaceService: WorkspaceService
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock console.log
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Create mock workspace service
    mockWorkspaceService = {
      discoverWorkspace: vi.fn(),
      getWorkspaceInfo: vi.fn().mockResolvedValue({
        path: '/test/workspace',
        name: 'test-workspace',
        isValid: true,
        hasPackages: true,
        hasCatalogs: true,
        packageCount: 5,
        catalogCount: 2,
        catalogNames: ['default', 'react17'],
      }),
      validateWorkspace: vi.fn().mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        recommendations: [],
        workspace: { isValid: true },
        catalogs: { isValid: true, errors: [], warnings: [] },
        packages: { isValid: true, errors: [], warnings: [] },
      }),
      getWorkspaceStats: vi.fn().mockResolvedValue({
        workspace: { path: '/test/workspace', name: 'test-workspace' },
        packages: { total: 5, withCatalogReferences: 3 },
        catalogs: { total: 2, names: ['default', 'react17'], totalEntries: 30 },
        dependencies: {
          total: 50,
          catalogManaged: 30,
          catalogReferences: 25,
          byType: {
            dependencies: 25,
            devDependencies: 15,
            peerDependencies: 5,
            optionalDependencies: 5,
          },
        },
      }),
      getCatalogs: vi.fn(),
      getPackages: vi.fn(),
      usesCatalogs: vi.fn(),
      getPackagesUsingCatalog: vi.fn(),
      findWorkspaces: vi.fn(),
      checkHealth: vi.fn(),
    } as unknown as WorkspaceService

    // Create command instance
    command = new WorkspaceCommand(mockWorkspaceService)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    vi.resetAllMocks()
  })

  describe('execute', () => {
    it('should show workspace info by default', async () => {
      try {
        await command.execute({})
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(0)
      }
      expect(mockWorkspaceService.getWorkspaceInfo).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should show workspace info with specified workspace path', async () => {
      try {
        await command.execute({ workspace: '/custom/workspace' })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mockWorkspaceService.getWorkspaceInfo).toHaveBeenCalledWith('/custom/workspace')
    })

    it('should validate workspace when --validate flag is set', async () => {
      try {
        await command.execute({ validate: true })
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(0)
      }
      expect(mockWorkspaceService.validateWorkspace).toHaveBeenCalled()
    })

    it('should return exit code 1 when validation fails', async () => {
      mockWorkspaceService.validateWorkspace = vi.fn().mockResolvedValue({
        isValid: false,
        errors: ['Error 1'],
        warnings: [],
        recommendations: [],
        workspace: { isValid: false },
        catalogs: { isValid: false, errors: ['Catalog error'], warnings: [] },
        packages: { isValid: true, errors: [], warnings: [] },
      })

      try {
        await command.execute({ validate: true })
        // Should not reach here
        expect.fail('Should have thrown CommandExitError')
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(1)
      }
    })

    it('should show stats when --stats flag is set', async () => {
      try {
        await command.execute({ stats: true })
      } catch (error) {
        expect((error as { exitCode: number }).exitCode).toBe(0)
      }
      expect(mockWorkspaceService.getWorkspaceStats).toHaveBeenCalled()
    })

    it('should show catalog names in output', async () => {
      try {
        await command.execute({})
      } catch {
        // Expected to throw CommandExitError
      }

      // Check that console.log was called with catalog names
      const calls = consoleSpy.mock.calls
      const catalogNamesCall = calls.find(
        (call) => String(call[0]).includes('default') && String(call[0]).includes('react17')
      )
      expect(catalogNamesCall).toBeDefined()
    })

    it('should work with different output formats', async () => {
      try {
        await command.execute({ format: 'json' })
      } catch {
        // Expected to throw CommandExitError
      }

      expect(mockWorkspaceService.getWorkspaceInfo).toHaveBeenCalled()
    })
  })

  describe('getHelpText', () => {
    it('should return help text', () => {
      const helpText = WorkspaceCommand.getHelpText()

      expect(helpText).toContain('Workspace information')
      expect(helpText).toContain('--validate')
      expect(helpText).toContain('--stats')
      expect(helpText).toContain('--format')
    })
  })
})
