/**
 * Analyze Command Tests
 */

import type { CatalogUpdateService, WorkspaceService } from '@pcu/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @pcu/utils
vi.mock('@pcu/utils', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
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

// Use vi.hoisted to ensure mocks are available during vi.mock hoisting
const mocks = vi.hoisted(() => ({
  analyzeUpdates: vi.fn(),
  getLatestVersion: vi.fn(),
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

// Mock @pcu/core - use class syntax for proper constructor mocking
vi.mock('@pcu/core', async (importOriginal) => {
  const actual = await importOriginal()

  // Create a proper class mock for AIAnalysisService
  const AIAnalysisServiceMock = vi.fn(function (this: Record<string, unknown>) {
    this.analyzeUpdates = mocks.analyzeUpdates
  })

  // Create a proper class mock for NpmRegistryService
  const NpmRegistryServiceMock = vi.fn(function (this: Record<string, unknown>) {
    this.getLatestVersion = mocks.getLatestVersion
  })

  return {
    ...(actual as object),
    AIAnalysisService: AIAnalysisServiceMock,
    NpmRegistryService: NpmRegistryServiceMock,
  }
})

// Import after mock setup
const { AnalyzeCommand } = await import('../analyzeCommand.js')

describe('AnalyzeCommand', () => {
  let command: InstanceType<typeof AnalyzeCommand>
  let mockCatalogUpdateService: CatalogUpdateService
  let mockWorkspaceService: WorkspaceService
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up default mock return values for hoisted mocks
    mocks.analyzeUpdates.mockResolvedValue({
      provider: 'rule-engine',
      confidence: 0.85,
      summary: 'Test analysis summary',
      recommendations: ['Recommendation 1'],
      risks: [],
    })
    mocks.getLatestVersion.mockResolvedValue({ toString: () => '4.17.21' })

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Create mock catalog update service
    mockCatalogUpdateService = {
      findCatalogForPackage: vi.fn().mockResolvedValue('default'),
      analyzeImpact: vi.fn().mockResolvedValue({
        catalogName: 'default',
        packageName: 'lodash',
        currentVersion: '4.17.20',
        proposedVersion: '4.17.21',
        updateType: 'patch',
        affectedPackages: ['package-a', 'package-b'],
        breakingChanges: [],
        recommendations: ['Safe to update'],
        riskLevel: 'low',
        securityImpact: {
          resolvedVulnerabilities: [],
          newVulnerabilities: [],
        },
      }),
      checkOutdatedDependencies: vi.fn(),
      planUpdates: vi.fn(),
      executeUpdates: vi.fn(),
    } as unknown as CatalogUpdateService

    // Create mock workspace service
    mockWorkspaceService = {
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
      discoverWorkspace: vi.fn(),
      validateWorkspace: vi.fn(),
      getWorkspaceStats: vi.fn(),
      getCatalogs: vi.fn(),
      getPackages: vi.fn(),
      usesCatalogs: vi.fn(),
      getPackagesUsingCatalog: vi.fn(),
      findWorkspaces: vi.fn(),
      checkHealth: vi.fn(),
    } as unknown as WorkspaceService

    command = new AnalyzeCommand(mockCatalogUpdateService, mockWorkspaceService)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    vi.resetAllMocks()
  })

  describe('execute', () => {
    it('should auto-detect catalog when not specified', async () => {
      await command.execute('lodash', undefined, {})

      expect(mockCatalogUpdateService.findCatalogForPackage).toHaveBeenCalledWith(
        'lodash',
        undefined
      )
    })

    it('should use specified catalog', async () => {
      await command.execute('lodash', undefined, { catalog: 'default' })

      expect(mockCatalogUpdateService.findCatalogForPackage).not.toHaveBeenCalled()
      expect(mockCatalogUpdateService.analyzeImpact).toHaveBeenCalledWith(
        'default',
        'lodash',
        expect.any(String),
        undefined
      )
    })

    it('should throw error when package not found in any catalog', async () => {
      mockCatalogUpdateService.findCatalogForPackage = vi.fn().mockResolvedValue(null)

      await expect(command.execute('unknown-package', undefined, {})).rejects.toThrow(
        'command.analyze.notFoundInCatalog'
      )
    })

    it('should use specified version when provided', async () => {
      await command.execute('lodash', '4.18.0', { catalog: 'default' })

      expect(mockCatalogUpdateService.analyzeImpact).toHaveBeenCalledWith(
        'default',
        'lodash',
        '4.18.0',
        undefined
      )
    })

    it('should fetch latest version when not specified', async () => {
      await command.execute('lodash', undefined, { catalog: 'default' })

      // The version should be fetched from NpmRegistryService
      expect(mockCatalogUpdateService.analyzeImpact).toHaveBeenCalled()
    })

    it('should run AI analysis by default', async () => {
      await command.execute('lodash', '4.17.21', { catalog: 'default' })

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should skip AI analysis when --no-ai is set', async () => {
      await command.execute('lodash', '4.17.21', { catalog: 'default', ai: false })

      expect(mockCatalogUpdateService.analyzeImpact).toHaveBeenCalled()
    })

    it('should use specified workspace path', async () => {
      await command.execute('lodash', '4.17.21', {
        catalog: 'default',
        workspace: '/custom/workspace',
      })

      expect(mockWorkspaceService.getWorkspaceInfo).toHaveBeenCalledWith('/custom/workspace')
    })
  })

  describe('validateArgs', () => {
    it('should return error for empty package name', () => {
      const errors = AnalyzeCommand.validateArgs('')

      expect(errors).toContain('validation.packageNameRequired')
    })

    it('should return error for whitespace-only package name', () => {
      const errors = AnalyzeCommand.validateArgs('   ')

      expect(errors).toContain('validation.packageNameRequired')
    })

    it('should return no errors for valid package name', () => {
      const errors = AnalyzeCommand.validateArgs('lodash')

      expect(errors).toHaveLength(0)
    })
  })

  describe('getHelpText', () => {
    it('should return help text with all options', () => {
      const helpText = AnalyzeCommand.getHelpText()

      expect(helpText).toContain('Analyze the impact')
      expect(helpText).toContain('--catalog')
      expect(helpText).toContain('--format')
      expect(helpText).toContain('--no-ai')
      expect(helpText).toContain('--provider')
      expect(helpText).toContain('--analysis-type')
    })
  })
})
