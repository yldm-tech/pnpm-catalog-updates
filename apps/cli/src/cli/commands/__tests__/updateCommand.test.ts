/**
 * Update Command Tests
 */

import type {
  CatalogUpdateService,
  IPackageManagerService,
  UpdatePlan,
  UpdateResult,
  WorkspaceService,
} from '@pcu/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCliOutput, resetCliOutput, setCliOutput } from '../../utils/cliOutput.js'

// Use vi.hoisted to ensure mocks are available during vi.mock hoisting
const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  selectPackages: vi.fn(),
  analyzeWithChunking: vi.fn(),
  getWorkspaceInfo: vi.fn(),
  formatUpdatePlan: vi.fn().mockReturnValue('Formatted plan'),
  formatUpdateResult: vi.fn().mockReturnValue('Formatted result'),
  // Package manager service mocks
  packageManagerInstall: vi.fn(),
  packageManagerGetName: vi.fn().mockReturnValue('pnpm'),
}))

// Mock @pcu/utils
vi.mock('@pcu/utils', () => ({
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
    this.analyzeWithChunking = mocks.analyzeWithChunking
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
  let mockWorkspaceService: WorkspaceService
  let mockPackageManagerService: IPackageManagerService
  // Use cliOutput mock instead of console spies for better testability
  let cliMock: ReturnType<typeof createMockCliOutput>

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
    mocks.analyzeWithChunking.mockResolvedValue({
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

    // Use cliOutput mock instead of console spies
    cliMock = createMockCliOutput()
    setCliOutput(cliMock.mock)

    // Create mock catalog update service
    mockCatalogUpdateService = {
      planUpdates: vi.fn().mockResolvedValue(mockUpdatePlan),
      executeUpdates: vi.fn().mockResolvedValue(mockUpdateResult),
      checkOutdatedDependencies: vi.fn(),
      findCatalogForPackage: vi.fn(),
      analyzeImpact: vi.fn(),
    } as unknown as CatalogUpdateService

    // Create mock workspace service
    mockWorkspaceService = {
      getWorkspaceInfo: mocks.getWorkspaceInfo,
      discoverWorkspace: vi.fn(),
      validateWorkspace: vi.fn(),
      getCatalogs: vi.fn(),
      getPackages: vi.fn(),
      usesCatalogs: vi.fn(),
      getPackagesUsingCatalog: vi.fn(),
      getWorkspaceStats: vi.fn(),
      findWorkspaces: vi.fn(),
      checkHealth: vi.fn(),
    } as unknown as WorkspaceService

    // Create mock package manager service
    mocks.packageManagerInstall.mockResolvedValue({
      success: true,
      code: 0,
      stdout: '',
      stderr: '',
    })
    mockPackageManagerService = {
      install: mocks.packageManagerInstall,
      getName: mocks.packageManagerGetName,
    } as unknown as IPackageManagerService

    command = new UpdateCommand(
      mockCatalogUpdateService,
      mockWorkspaceService,
      mockPackageManagerService
    )
  })

  afterEach(() => {
    // Reset cliOutput to default implementation
    resetCliOutput()
    vi.resetAllMocks()
  })

  describe('execute', () => {
    it('should plan and execute updates', async () => {
      await command.execute({})

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalled()
      expect(mockCatalogUpdateService.executeUpdates).toHaveBeenCalled()
      expect(cliMock.prints.length).toBeGreaterThan(0)
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

      expect(cliMock.prints.length).toBeGreaterThan(0)
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

      expect(mocks.analyzeWithChunking).toHaveBeenCalled()
      expect(cliMock.prints.length).toBeGreaterThan(0)
    })

    it('should continue without AI when analysis fails', async () => {
      mocks.analyzeWithChunking.mockRejectedValue(new Error('AI analysis failed'))

      await command.execute({ ai: true })

      expect(cliMock.warns.length).toBeGreaterThan(0)
      expect(mockCatalogUpdateService.executeUpdates).toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      mockCatalogUpdateService.planUpdates = vi.fn().mockRejectedValue(new Error('Plan failed'))

      await expect(command.execute({})).rejects.toThrow('Plan failed')
      expect(cliMock.errors.length).toBeGreaterThan(0)
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

      expect(errors).toContain('validation.invalidFormat')
    })

    it('should return error for invalid target', () => {
      const errors = UpdateCommand.validateOptions({
        target: 'invalid' as never,
      })

      expect(errors).toContain('validation.invalidTarget')
    })

    it('should return error when interactive and dry-run are both set', () => {
      const errors = UpdateCommand.validateOptions({
        interactive: true,
        dryRun: true,
      })

      expect(errors).toContain('validation.interactiveWithDryRun')
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

  // TEST-001: Boundary condition and error path tests
  describe('boundary conditions and error handling', () => {
    it('should handle network timeout during plan', async () => {
      const timeoutError = new Error('ETIMEDOUT: Connection timed out')
      timeoutError.name = 'TimeoutError'
      mockCatalogUpdateService.planUpdates = vi.fn().mockRejectedValue(timeoutError)

      await expect(command.execute({})).rejects.toThrow('ETIMEDOUT')
      expect(cliMock.errors.length).toBeGreaterThan(0)
    })

    it('should handle network connection refused', async () => {
      const connectionError = new Error('ECONNREFUSED: Connection refused')
      mockCatalogUpdateService.planUpdates = vi.fn().mockRejectedValue(connectionError)

      await expect(command.execute({})).rejects.toThrow('ECONNREFUSED')
      expect(cliMock.errors.length).toBeGreaterThan(0)
    })

    it('should handle empty workspace path gracefully', async () => {
      await command.execute({ workspace: '' })

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalledWith(
        expect.objectContaining({
          workspacePath: '',
        })
      )
    })

    it('should handle undefined options without crashing', async () => {
      await command.execute(undefined as unknown as Record<string, unknown>)

      expect(mockCatalogUpdateService.planUpdates).toHaveBeenCalled()
    })

    it('should handle user cancellation (Ctrl+C) gracefully', async () => {
      const cancelError = new Error('User cancelled')
      cancelError.name = 'ExitPromptError'
      mockCatalogUpdateService.planUpdates = vi.fn().mockRejectedValue(cancelError)

      // Should not throw for user cancellation
      await expect(command.execute({})).resolves.not.toThrow()
      expect(cliMock.prints.some((p) => p.includes('cancelled') || p.includes('warning'))).toBe(
        true
      )
    })

    it('should handle force closed prompt gracefully', async () => {
      const forceCloseError = new Error('Prompt was force closed')
      mockCatalogUpdateService.planUpdates = vi.fn().mockRejectedValue(forceCloseError)

      await expect(command.execute({})).resolves.not.toThrow()
    })

    it('should handle very large update plan', async () => {
      const largeUpdates = Array.from({ length: 500 }, (_, i) => ({
        packageName: `package-${i}`,
        catalogName: 'default',
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
        updateType: 'major' as const,
      }))

      mockCatalogUpdateService.planUpdates = vi.fn().mockResolvedValue({
        totalUpdates: 500,
        updates: largeUpdates,
        hasSecurityUpdates: false,
        hasMajorUpdates: true,
        hasMinorUpdates: false,
        hasPatchUpdates: false,
      })

      await command.execute({})

      expect(mockCatalogUpdateService.executeUpdates).toHaveBeenCalled()
    })

    it('should handle special characters in package names', async () => {
      mockCatalogUpdateService.planUpdates = vi.fn().mockResolvedValue({
        totalUpdates: 1,
        updates: [
          {
            packageName: '@scope/package-name.test',
            catalogName: 'default',
            currentVersion: '1.0.0',
            newVersion: '2.0.0',
            updateType: 'major',
          },
        ],
        hasSecurityUpdates: false,
        hasMajorUpdates: true,
        hasMinorUpdates: false,
        hasPatchUpdates: false,
      })

      await command.execute({})

      expect(mockCatalogUpdateService.executeUpdates).toHaveBeenCalled()
    })

    it('should handle concurrent execution attempts', async () => {
      // Simulate slow execution
      mockCatalogUpdateService.planUpdates = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve(mockUpdatePlan), 100))
        )

      // Start two concurrent executions
      const execution1 = command.execute({})
      const execution2 = command.execute({})

      // Both should complete without errors
      await expect(Promise.all([execution1, execution2])).resolves.not.toThrow()
    })

    it('should handle partial update failure in result', async () => {
      mockCatalogUpdateService.executeUpdates = vi.fn().mockResolvedValue({
        success: false,
        appliedUpdates: [mockUpdatePlan.updates[0]],
        failedUpdates: [mockUpdatePlan.updates[1]],
        backupPath: null,
        errors: ['Failed to update typescript'],
      })

      await command.execute({})

      expect(cliMock.prints.length).toBeGreaterThan(0)
    })

    it('should handle invalid semver versions gracefully', async () => {
      mockCatalogUpdateService.planUpdates = vi.fn().mockResolvedValue({
        totalUpdates: 1,
        updates: [
          {
            packageName: 'test-pkg',
            catalogName: 'default',
            currentVersion: 'invalid',
            newVersion: 'also-invalid',
            updateType: 'unknown',
          },
        ],
        hasSecurityUpdates: false,
        hasMajorUpdates: false,
        hasMinorUpdates: false,
        hasPatchUpdates: false,
      })

      await command.execute({})

      expect(mockCatalogUpdateService.executeUpdates).toHaveBeenCalled()
    })
  })

  describe('package manager integration', () => {
    it('should call package manager install after successful update', async () => {
      await command.execute({ install: true })

      expect(mocks.packageManagerInstall).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: expect.any(String),
        })
      )
    })

    it('should skip install when install option is false', async () => {
      await command.execute({ install: false })

      expect(mocks.packageManagerInstall).not.toHaveBeenCalled()
    })

    it('should continue successfully when package manager install fails', async () => {
      mocks.packageManagerInstall.mockResolvedValue({
        success: false,
        code: 1,
        stdout: '',
        stderr: 'ERESOLVE unable to resolve dependency tree',
      })

      // Should not throw even if install fails
      await expect(command.execute({})).resolves.not.toThrow()
      expect(cliMock.prints.length).toBeGreaterThan(0)
    })

    it('should handle install timeout gracefully', async () => {
      mocks.packageManagerInstall.mockResolvedValue({
        success: false,
        code: null,
        stdout: '',
        stderr: '',
        error: new Error('Command timed out after 300000ms'),
      })

      // Should not throw even if install times out
      await expect(command.execute({})).resolves.not.toThrow()
    })

    it('should get package manager name for logging', async () => {
      mocks.packageManagerInstall.mockResolvedValue({
        success: false,
        code: 1,
        stdout: '',
        stderr: 'Error',
      })

      await command.execute({})

      expect(mocks.packageManagerGetName).toHaveBeenCalled()
    })
  })
})
