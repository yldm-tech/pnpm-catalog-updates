/**
 * Update Command Tests
 */

import type { CatalogUpdateService, UpdatePlan, UpdateResult } from '@pcu/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted to ensure mocks are available during vi.mock hoisting
const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  selectPackages: vi.fn(),
  analyzeUpdates: vi.fn(),
  getWorkspaceInfo: vi.fn(),
  formatUpdatePlan: vi.fn().mockReturnValue('Formatted plan'),
  formatUpdateResult: vi.fn().mockReturnValue('Formatted result'),
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
    loadConfig: mocks.loadConfig,
  },
  t: (key: string, params?: Record<string, unknown>) => {
    if (params) {
      let result = key
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{{${k}}}`, String(v))
      }
      return result
    }
    return key
  },
}))

// Mock OutputFormatter - needs to be a proper class constructor
vi.mock('../../formatters/outputFormatter.js', () => {
  return {
    OutputFormatter: class MockOutputFormatter {
      formatUpdatePlan = mocks.formatUpdatePlan
      formatUpdateResult = mocks.formatUpdateResult
      formatOutdatedReport = vi.fn()
      formatSecurityReport = vi.fn()
      formatImpactAnalysis = vi.fn()
    },
  }
})

// Mock ProgressBar - needs to be a proper class constructor
vi.mock('../../formatters/progressBar.js', () => ({
  ProgressBar: class MockProgressBar {
    start = vi.fn()
    update = vi.fn()
    stop = vi.fn()
    succeed = vi.fn()
    fail = vi.fn()
    warn = vi.fn()
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
    iconWarning: (text: string) => `[warning]${text}`,
    iconUpdate: (text: string) => `[update]${text}`,
    iconPackage: (text: string) => `[package]${text}`,
    iconComplete: (text: string) => `[complete]${text}`,
    muted: (text: string) => `[muted]${text}`,
    error: (text: string) => `[error]${text}`,
  },
}))

// Create a chainable chalk mock that supports all color combinations
const createChalkMock = () => {
  const createColorFn = (text: string) => text
  // Create a function that returns itself for chaining
  const chainableFn = Object.assign(createColorFn, {
    bold: Object.assign((text: string) => text, {
      cyan: (text: string) => text,
      white: (text: string) => text,
      red: (text: string) => text,
      green: (text: string) => text,
      yellow: (text: string) => text,
      blue: (text: string) => text,
    }),
    dim: Object.assign((text: string) => text, {
      white: (text: string) => text,
    }),
    red: Object.assign((text: string) => text, {
      bold: (text: string) => text,
    }),
    green: Object.assign((text: string) => text, {
      bold: (text: string) => text,
    }),
    yellow: Object.assign((text: string) => text, {
      bold: (text: string) => text,
    }),
    blue: Object.assign((text: string) => text, {
      bold: (text: string) => text,
    }),
    cyan: Object.assign((text: string) => text, {
      bold: (text: string) => text,
    }),
    gray: (text: string) => text,
    white: (text: string) => text,
  })
  return chainableFn
}

// Mock chalk
vi.mock('chalk', () => ({
  default: createChalkMock(),
}))

// Mock interactive prompts
vi.mock('../../interactive/interactivePrompts.js', () => {
  const InteractivePromptsMock = vi.fn(function (this: Record<string, unknown>) {
    this.selectPackages = mocks.selectPackages
  })
  return { InteractivePrompts: InteractivePromptsMock }
})

// Mock @pcu/core - use class syntax for proper constructor mocking
vi.mock('@pcu/core', async (importOriginal) => {
  const actual = await importOriginal()

  const AIAnalysisServiceMock = vi.fn(function (this: Record<string, unknown>) {
    this.analyzeUpdates = mocks.analyzeUpdates
  })

  const WorkspaceServiceMock = vi.fn(function (this: Record<string, unknown>) {
    this.getWorkspaceInfo = mocks.getWorkspaceInfo
  })

  const FileSystemServiceMock = vi.fn()
  const FileWorkspaceRepositoryMock = vi.fn()

  return {
    ...(actual as object),
    AIAnalysisService: AIAnalysisServiceMock,
    WorkspaceService: WorkspaceServiceMock,
    FileSystemService: FileSystemServiceMock,
    FileWorkspaceRepository: FileWorkspaceRepositoryMock,
  }
})

// Import after mock setup
const { UpdateCommand } = await import('../updateCommand.js')

describe('UpdateCommand', () => {
  let command: InstanceType<typeof UpdateCommand>
  let mockCatalogUpdateService: CatalogUpdateService
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  const mockUpdatePlan: UpdatePlan = {
    totalUpdates: 2,
    updates: [
      {
        packageName: 'lodash',
        catalogName: 'default',
        currentVersion: '4.17.20',
        newVersion: '4.17.21',
        updateType: 'patch',
      },
      {
        packageName: 'typescript',
        catalogName: 'default',
        currentVersion: '5.0.0',
        newVersion: '5.3.0',
        updateType: 'minor',
      },
    ],
    hasSecurityUpdates: false,
    hasMajorUpdates: false,
    hasMinorUpdates: true,
    hasPatchUpdates: true,
  }

  const mockUpdateResult: UpdateResult = {
    success: true,
    appliedUpdates: mockUpdatePlan.updates,
    failedUpdates: [],
    backupPath: null,
    errors: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up ConfigLoader mock
    mocks.loadConfig.mockReturnValue({
      defaults: {
        target: 'latest',
        format: 'table',
        interactive: false,
        dryRun: false,
        createBackup: false,
      },
      include: [],
      exclude: [],
    })

    // Set up default mock return values
    mocks.selectPackages.mockResolvedValue(['lodash', 'typescript'])
    mocks.analyzeUpdates.mockResolvedValue({
      provider: 'rule-engine',
      confidence: 0.85,
      summary: 'Test analysis summary',
      recommendations: [],
      processingTimeMs: 100,
    })
    mocks.getWorkspaceInfo.mockResolvedValue({
      path: '/test/workspace',
      name: 'test-workspace',
      packageCount: 5,
      catalogCount: 2,
    })

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Create mock catalog update service
    mockCatalogUpdateService = {
      planUpdates: vi.fn().mockResolvedValue(mockUpdatePlan),
      executeUpdates: vi.fn().mockResolvedValue(mockUpdateResult),
      checkOutdatedDependencies: vi.fn(),
      findCatalogForPackage: vi.fn(),
      analyzeImpact: vi.fn(),
    } as unknown as CatalogUpdateService

    command = new UpdateCommand(mockCatalogUpdateService)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    vi.resetAllMocks()
  })

  describe('execute', () => {
    it('should plan and execute updates', async () => {
      await command.execute({})

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalled()
      expect(mockCatalogUpdateService.executeUpdates).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should use specified workspace path', async () => {
      await command.execute({ workspace: '/custom/workspace' })

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalledWith(
        expect.objectContaining({
          workspacePath: '/custom/workspace',
        })
      )
    })

    it('should filter by catalog name', async () => {
      await command.execute({ catalog: 'react17' })

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalledWith(
        expect.objectContaining({
          catalogName: 'react17',
        })
      )
    })

    it('should use specified target', async () => {
      await command.execute({ target: 'minor' })

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'minor',
        })
      )
    })

    it('should not execute updates in dry-run mode', async () => {
      await command.execute({ dryRun: true })

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalled()
      expect(mockCatalogUpdateService.executeUpdates).not.toHaveBeenCalled()
    })

    it('should show message when no updates found', async () => {
      mockCatalogUpdateService.planUpdates = vi.fn().mockResolvedValue({
        totalUpdates: 0,
        updates: [],
        hasSecurityUpdates: false,
        hasMajorUpdates: false,
        hasMinorUpdates: false,
        hasPatchUpdates: false,
      })

      await command.execute({})

      expect(consoleSpy).toHaveBeenCalled()
      expect(mockCatalogUpdateService.executeUpdates).not.toHaveBeenCalled()
    })

    it('should use interactive selection when interactive mode is enabled', async () => {
      mocks.selectPackages.mockResolvedValue(['lodash'])

      await command.execute({ interactive: true })

      expect(mocks.selectPackages).toHaveBeenCalled()
      expect(mockCatalogUpdateService.executeUpdates).toHaveBeenCalled()
    })

    it('should not execute when no packages selected in interactive mode', async () => {
      mocks.selectPackages.mockResolvedValue([])

      await command.execute({ interactive: true })

      expect(mockCatalogUpdateService.executeUpdates).not.toHaveBeenCalled()
    })

    it('should perform AI analysis when ai option is enabled', async () => {
      await command.execute({ ai: true })

      expect(mocks.analyzeUpdates).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should continue without AI when analysis fails', async () => {
      mocks.analyzeUpdates.mockRejectedValue(new Error('AI analysis failed'))

      await command.execute({ ai: true })

      expect(consoleWarnSpy).toHaveBeenCalled()
      expect(mockCatalogUpdateService.executeUpdates).toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      mockCatalogUpdateService.planUpdates = vi.fn().mockRejectedValue(new Error('Plan failed'))

      await expect(command.execute({})).rejects.toThrow('Plan failed')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should apply include patterns', async () => {
      await command.execute({ include: ['lodash', 'react*'] })

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalledWith(
        expect.objectContaining({
          include: ['lodash', 'react*'],
        })
      )
    })

    it('should apply exclude patterns', async () => {
      await command.execute({ exclude: ['@types/*'] })

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalledWith(
        expect.objectContaining({
          exclude: ['@types/*'],
        })
      )
    })

    it('should create backup when specified', async () => {
      await command.execute({ createBackup: true })

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalledWith(
        expect.objectContaining({
          createBackup: true,
        })
      )
    })
  })

  describe('validateOptions', () => {
    it('should return no errors for valid options', () => {
      const errors = UpdateCommand.validateOptions({
        format: 'json',
        target: 'minor',
      })

      expect(errors).toHaveLength(0)
    })

    it('should return error for invalid format', () => {
      const errors = UpdateCommand.validateOptions({
        format: 'invalid' as never,
      })

      expect(errors).toContain('Invalid format. Must be one of: table, json, yaml, minimal')
    })

    it('should return error for invalid target', () => {
      const errors = UpdateCommand.validateOptions({
        target: 'invalid' as never,
      })

      expect(errors).toContain(
        'Invalid target. Must be one of: latest, greatest, minor, patch, newest'
      )
    })

    it('should return error when interactive and dry-run are both set', () => {
      const errors = UpdateCommand.validateOptions({
        interactive: true,
        dryRun: true,
      })

      expect(errors).toContain('Cannot use --interactive with --dry-run')
    })
  })

  describe('getHelpText', () => {
    it('should return help text with all options', () => {
      const helpText = UpdateCommand.getHelpText()

      expect(helpText).toContain('Update catalog dependencies')
      expect(helpText).toContain('--workspace')
      expect(helpText).toContain('--catalog')
      expect(helpText).toContain('--format')
      expect(helpText).toContain('--target')
      expect(helpText).toContain('--interactive')
      expect(helpText).toContain('--dry-run')
      expect(helpText).toContain('--force')
      expect(helpText).toContain('--include')
      expect(helpText).toContain('--exclude')
      expect(helpText).toContain('--create-backup')
    })
  })
})
