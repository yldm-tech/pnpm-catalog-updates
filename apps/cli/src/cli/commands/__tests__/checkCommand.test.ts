/**
 * Check Command Tests
 */

import type { CatalogUpdateService, OutdatedReport } from '@pcu/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted to ensure mocks are available during vi.mock hoisting
const utilsMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
}))

const formatterMocks = vi.hoisted(() => ({
  formatOutdatedReport: vi.fn().mockReturnValue('Formatted output'),
}))

// Mock @pcu/utils
vi.mock('@pcu/utils', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  ConfigLoader: {
    loadConfig: utilsMocks.loadConfig,
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
    utilsMocks.loadConfig.mockReturnValue({
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
      await command.execute({})

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(0)
    })

    it('should use specified workspace path', async () => {
      await command.execute({ workspace: '/custom/workspace' })

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          workspacePath: '/custom/workspace',
        })
      )
    })

    it('should filter by catalog name', async () => {
      await command.execute({ catalog: 'react17' })

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          catalogName: 'react17',
        })
      )
    })

    it('should use specified target', async () => {
      await command.execute({ target: 'minor' })

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'minor',
        })
      )
    })

    it('should include prerelease versions when specified', async () => {
      await command.execute({ prerelease: true })

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          includePrerelease: true,
        })
      )
    })

    it('should apply include patterns', async () => {
      await command.execute({ include: ['lodash', 'react*'] })

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          include: ['lodash', 'react*'],
        })
      )
    })

    it('should apply exclude patterns', async () => {
      await command.execute({ exclude: ['@types/*'] })

      expect(mockCatalogUpdateService.checkOutdatedDependencies).toHaveBeenCalledWith(
        expect.objectContaining({
          exclude: ['@types/*'],
        })
      )
    })

    it('should show verbose output when specified', async () => {
      await command.execute({ verbose: true })

      expect(consoleSpy).toHaveBeenCalled()
      // Verbose mode shows additional information
      const calls = consoleSpy.mock.calls.flat().join(' ')
      expect(calls).toContain('Workspace')
    })

    it('should handle error and exit with code 1', async () => {
      mockCatalogUpdateService.checkOutdatedDependencies = vi
        .fn()
        .mockRejectedValue(new Error('Check failed'))

      await command.execute({})

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(1)
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

      await command.execute({})

      expect(consoleSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(0)
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

      expect(errors).toContain('Invalid format. Must be one of: table, json, yaml, minimal')
    })

    it('should return error for invalid target', () => {
      const errors = CheckCommand.validateOptions({
        target: 'invalid' as never,
      })

      expect(errors).toContain(
        'Invalid target. Must be one of: latest, greatest, minor, patch, newest'
      )
    })

    it('should return error for empty include patterns', () => {
      const errors = CheckCommand.validateOptions({
        include: ['lodash', '   '],
      })

      expect(errors).toContain('Include patterns cannot be empty')
    })

    it('should return error for empty exclude patterns', () => {
      const errors = CheckCommand.validateOptions({
        exclude: ['', '@types/*'],
      })

      expect(errors).toContain('Exclude patterns cannot be empty')
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
