/**
 * Workspace Command Tests
 */

import type { WorkspaceService } from '@pcu/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceCommand } from '../workspaceCommand.js'

describe('WorkspaceCommand', () => {
  let command: WorkspaceCommand
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
      const result = await command.execute({})

      expect(result).toBe(0)
      expect(mockWorkspaceService.getWorkspaceInfo).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should show workspace info with specified workspace path', async () => {
      await command.execute({ workspace: '/custom/workspace' })

      expect(mockWorkspaceService.getWorkspaceInfo).toHaveBeenCalledWith('/custom/workspace')
    })

    it('should validate workspace when --validate flag is set', async () => {
      const result = await command.execute({ validate: true })

      expect(result).toBe(0)
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

      const result = await command.execute({ validate: true })

      expect(result).toBe(1)
    })

    it('should show stats when --stats flag is set', async () => {
      const result = await command.execute({ stats: true })

      expect(result).toBe(0)
      expect(mockWorkspaceService.getWorkspaceStats).toHaveBeenCalled()
    })

    it('should show catalog names in output', async () => {
      await command.execute({})

      // Check that console.log was called with catalog names
      const calls = consoleSpy.mock.calls
      const catalogNamesCall = calls.find(
        (call) => String(call[0]).includes('default') && String(call[0]).includes('react17')
      )
      expect(catalogNamesCall).toBeDefined()
    })

    it('should work with different output formats', async () => {
      await command.execute({ format: 'json' })

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
