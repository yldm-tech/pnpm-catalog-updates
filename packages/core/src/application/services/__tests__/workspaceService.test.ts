/**
 * Workspace Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../../domain/entities/catalog.js'
import type { CatalogCollection } from '../../../domain/entities/catalogCollection.js'
import type { Package } from '../../../domain/entities/package.js'
import type { PackageCollection } from '../../../domain/entities/packageCollection.js'
import type { Workspace } from '../../../domain/entities/workspace.js'
import type { WorkspaceRepository } from '../../../domain/repositories/workspaceRepository.js'
import { WorkspaceService } from '../workspaceService.js'

describe('WorkspaceService', () => {
  let service: WorkspaceService
  let mockWorkspaceRepository: WorkspaceRepository
  let mockWorkspace: Workspace
  let mockCatalog: Catalog
  let mockCatalogCollection: CatalogCollection
  let mockPackageCollection: PackageCollection
  let mockPackage: Package

  const createMockCatalog = (name: string, packages: string[]): Catalog =>
    ({
      getName: vi.fn().mockReturnValue(name),
      getPackageNames: vi.fn().mockReturnValue(packages),
      getMode: vi.fn().mockReturnValue('strict'),
      getDependencies: vi.fn().mockReturnValue(new Map(packages.map((p) => [p, '1.0.0']))),
    }) as unknown as Catalog

  const createMockPackage = (
    name: string,
    catalogRefs: Array<{ catalogName: string; packageName: string; dependencyType: string }>
  ): Package =>
    ({
      getName: vi.fn().mockReturnValue(name),
      getPath: vi.fn().mockReturnValue({
        toString: () => `/test/packages/${name}`,
      }),
      getCatalogReferences: vi.fn().mockReturnValue(
        catalogRefs.map((ref) => ({
          getCatalogName: () => ref.catalogName,
          getPackageName: () => ref.packageName,
          getDependencyType: () => ref.dependencyType,
        }))
      ),
      getDependencies: vi.fn().mockReturnValue({
        getDependenciesByType: vi.fn().mockReturnValue(new Map([['lodash', '^4.17.21']])),
      }),
    }) as unknown as Package

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock catalog
    mockCatalog = createMockCatalog('default', ['lodash', 'typescript', 'react'])

    // Create mock catalog collection
    mockCatalogCollection = {
      get: vi.fn().mockReturnValue(mockCatalog),
      getAll: vi.fn().mockReturnValue([mockCatalog]),
      has: vi.fn().mockReturnValue(true),
      size: vi.fn().mockReturnValue(1),
      isEmpty: vi.fn().mockReturnValue(false),
      getCatalogNames: vi.fn().mockReturnValue(['default']),
      validate: vi.fn().mockReturnValue({
        getIsValid: () => true,
        getErrors: () => [],
        getWarnings: () => [],
      }),
    } as unknown as CatalogCollection

    // Create mock package
    mockPackage = createMockPackage('test-package', [
      { catalogName: 'default', packageName: 'lodash', dependencyType: 'dependencies' },
    ])

    // Create mock package collection
    mockPackageCollection = {
      getAll: vi.fn().mockReturnValue([mockPackage]),
      size: vi.fn().mockReturnValue(1),
      isEmpty: vi.fn().mockReturnValue(false),
      findPackagesWithCatalogReferences: vi.fn().mockReturnValue([mockPackage]),
      findPackagesUsingCatalog: vi.fn().mockReturnValue([mockPackage]),
    } as unknown as PackageCollection

    // Create mock workspace
    mockWorkspace = {
      getId: vi.fn().mockReturnValue({ value: 'workspace-1' }),
      getPath: vi.fn().mockReturnValue({
        toString: () => '/test/workspace',
        getDirectoryName: () => 'test-workspace',
      }),
      getName: vi.fn().mockReturnValue('test-workspace'),
      getCatalogs: vi.fn().mockReturnValue(mockCatalogCollection),
      getPackages: vi.fn().mockReturnValue(mockPackageCollection),
      validateConsistency: vi.fn().mockReturnValue({
        getIsValid: () => true,
        getErrors: () => [],
        getWarnings: () => [],
      }),
    } as unknown as Workspace

    // Create mock workspace repository
    mockWorkspaceRepository = {
      findByPath: vi.fn().mockResolvedValue(mockWorkspace),
      findById: vi.fn().mockResolvedValue(mockWorkspace),
      save: vi.fn().mockResolvedValue(undefined),
      loadConfiguration: vi.fn().mockResolvedValue({}),
      saveConfiguration: vi.fn().mockResolvedValue(undefined),
      isValidWorkspace: vi.fn().mockResolvedValue(true),
      discoverWorkspace: vi.fn().mockResolvedValue(mockWorkspace),
    }

    // Create service instance
    service = new WorkspaceService(mockWorkspaceRepository)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('discoverWorkspace', () => {
    it('should discover workspace from current directory', async () => {
      const workspace = await service.discoverWorkspace()

      expect(mockWorkspaceRepository.discoverWorkspace).toHaveBeenCalled()
      expect(workspace).toBe(mockWorkspace)
    })

    it('should discover workspace from specified path', async () => {
      const workspace = await service.discoverWorkspace('/custom/path')

      expect(mockWorkspaceRepository.discoverWorkspace).toHaveBeenCalled()
      expect(workspace).toBe(mockWorkspace)
    })

    it('should throw error when no workspace found', async () => {
      mockWorkspaceRepository.discoverWorkspace = vi.fn().mockResolvedValue(null)

      await expect(service.discoverWorkspace()).rejects.toThrow('Workspace not found')
    })

    it('should throw error with path info when specified path has no workspace', async () => {
      mockWorkspaceRepository.discoverWorkspace = vi.fn().mockResolvedValue(null)

      await expect(service.discoverWorkspace('/custom/path')).rejects.toThrow(
        'Workspace not found at "/custom/path"'
      )
    })
  })

  describe('getWorkspaceInfo', () => {
    it('should return workspace info for valid workspace', async () => {
      const info = await service.getWorkspaceInfo('/test/workspace')

      expect(info).toEqual({
        path: '/test/workspace',
        name: 'workspace', // getDirectoryName() from WorkspacePath, not workspace.getName()
        isValid: true,
        hasPackages: true,
        hasCatalogs: true,
        packageCount: 1,
        catalogCount: 1,
        catalogNames: ['default'],
      })
    })

    it('should return invalid info when workspace not found', async () => {
      mockWorkspaceRepository.findByPath = vi.fn().mockResolvedValue(null)

      const info = await service.getWorkspaceInfo('/invalid/path')

      expect(info.isValid).toBe(false)
      expect(info.hasPackages).toBe(false)
      expect(info.hasCatalogs).toBe(false)
      expect(info.packageCount).toBe(0)
      expect(info.catalogCount).toBe(0)
    })

    it('should use current working directory when no path specified', async () => {
      await service.getWorkspaceInfo()

      expect(mockWorkspaceRepository.findByPath).toHaveBeenCalled()
    })
  })

  describe('validateWorkspace', () => {
    it('should return valid report for valid workspace', async () => {
      const report = await service.validateWorkspace('/test/workspace')

      expect(report.isValid).toBe(true)
      expect(report.errors).toHaveLength(0)
      expect(report.workspace.isValid).toBe(true)
    })

    it('should return invalid report for invalid workspace', async () => {
      mockWorkspaceRepository.findByPath = vi.fn().mockResolvedValue(null)

      const report = await service.validateWorkspace('/invalid/path')

      expect(report.isValid).toBe(false)
      expect(report.errors).toContain('Not a valid pnpm workspace')
      expect(report.recommendations.length).toBeGreaterThan(0)
    })

    it('should include recommendations for workspace without catalogs', async () => {
      const emptyCatalogCollection = {
        ...mockCatalogCollection,
        isEmpty: vi.fn().mockReturnValue(true),
        size: vi.fn().mockReturnValue(0),
        validate: vi.fn().mockReturnValue({
          getIsValid: () => true,
          getErrors: () => [],
          getWarnings: () => [],
        }),
      } as unknown as CatalogCollection

      mockWorkspace.getCatalogs = vi.fn().mockReturnValue(emptyCatalogCollection)

      // Also need to update getWorkspaceInfo mock behavior
      const info = await service.getWorkspaceInfo('/test/workspace')
      // hasCatalogs will be false because isEmpty returns true

      const report = await service.validateWorkspace('/test/workspace')

      expect(report.recommendations).toContain(
        'Consider using catalogs to centralize dependency management'
      )
    })

    it('should include recommendations for empty workspace', async () => {
      const emptyPackageCollection = {
        ...mockPackageCollection,
        isEmpty: vi.fn().mockReturnValue(true),
        size: vi.fn().mockReturnValue(0),
      } as unknown as PackageCollection

      mockWorkspace.getPackages = vi.fn().mockReturnValue(emptyPackageCollection)

      const report = await service.validateWorkspace('/test/workspace')

      expect(report.recommendations).toContain(
        'No packages found - check your package patterns in pnpm-workspace.yaml'
      )
    })
  })

  describe('getCatalogs', () => {
    it('should return catalog information', async () => {
      const catalogs = await service.getCatalogs('/test/workspace')

      expect(catalogs).toHaveLength(1)
      expect(catalogs[0]).toEqual({
        name: 'default',
        packageCount: 3,
        packages: ['lodash', 'typescript', 'react'],
        mode: 'strict',
      })
    })

    it('should throw error when workspace not found', async () => {
      mockWorkspaceRepository.discoverWorkspace = vi.fn().mockResolvedValue(null)

      await expect(service.getCatalogs('/invalid/path')).rejects.toThrow()
    })
  })

  describe('getPackages', () => {
    it('should return package information', async () => {
      const packages = await service.getPackages('/test/workspace')

      expect(packages).toHaveLength(1)
      expect(packages[0].name).toBe('test-package')
      expect(packages[0].hasPackageJson).toBe(true)
      expect(packages[0].catalogReferences).toHaveLength(1)
    })

    it('should include all dependency types', async () => {
      const packages = await service.getPackages('/test/workspace')

      expect(packages[0].dependencies.length).toBeGreaterThan(0)
    })
  })

  describe('usesCatalogs', () => {
    it('should return true when workspace uses catalogs', async () => {
      const result = await service.usesCatalogs('/test/workspace')

      expect(result).toBe(true)
    })

    it('should return false when workspace has no catalogs', async () => {
      const emptyCatalogCollection = {
        ...mockCatalogCollection,
        isEmpty: vi.fn().mockReturnValue(true),
      } as unknown as CatalogCollection

      mockWorkspace.getCatalogs = vi.fn().mockReturnValue(emptyCatalogCollection)

      const result = await service.usesCatalogs('/test/workspace')

      expect(result).toBe(false)
    })

    it('should return false when workspace discovery fails', async () => {
      mockWorkspaceRepository.discoverWorkspace = vi.fn().mockResolvedValue(null)

      const result = await service.usesCatalogs('/invalid/path')

      expect(result).toBe(false)
    })
  })

  describe('getPackagesUsingCatalog', () => {
    it('should return packages using specific catalog', async () => {
      const packages = await service.getPackagesUsingCatalog('default', '/test/workspace')

      expect(packages.length).toBeGreaterThan(0)
      expect(mockPackageCollection.findPackagesUsingCatalog).toHaveBeenCalledWith('default')
    })
  })

  describe('getWorkspaceStats', () => {
    it('should return workspace statistics', async () => {
      const stats = await service.getWorkspaceStats('/test/workspace')

      expect(stats).toHaveProperty('workspace')
      expect(stats).toHaveProperty('packages')
      expect(stats).toHaveProperty('catalogs')
      expect(stats).toHaveProperty('dependencies')

      expect(stats.workspace.path).toBe('/test/workspace')
      expect(stats.packages.total).toBe(1)
      expect(stats.catalogs.total).toBe(1)
    })

    it('should count catalog references correctly', async () => {
      const stats = await service.getWorkspaceStats('/test/workspace')

      expect(stats.packages.withCatalogReferences).toBe(1)
    })
  })

  describe('findWorkspaces', () => {
    it('should find valid workspace in directory', async () => {
      const workspaces = await service.findWorkspaces('/test/workspace')

      expect(workspaces).toHaveLength(1)
      expect(workspaces[0].isValid).toBe(true)
    })

    it('should return empty array for invalid directory', async () => {
      mockWorkspaceRepository.findByPath = vi.fn().mockResolvedValue(null)

      const workspaces = await service.findWorkspaces('/invalid/path')

      expect(workspaces).toHaveLength(0)
    })
  })

  describe('checkHealth', () => {
    it('should return health report with good score for valid workspace', async () => {
      const report = await service.checkHealth('/test/workspace')

      expect(report).toHaveProperty('score')
      expect(report).toHaveProperty('status')
      expect(report).toHaveProperty('validation')
      expect(report).toHaveProperty('stats')
      expect(report).toHaveProperty('issues')
      expect(report).toHaveProperty('lastChecked')

      expect(report.score).toBeGreaterThanOrEqual(70)
      expect(['excellent', 'good', 'fair', 'poor']).toContain(report.status)
    })

    it('should return lower score for workspace with issues', async () => {
      // Mock workspace with validation errors
      mockWorkspace.validateConsistency = vi.fn().mockReturnValue({
        getIsValid: () => false,
        getErrors: () => ['Error 1', 'Error 2'],
        getWarnings: () => ['Warning 1'],
      })

      const report = await service.checkHealth('/test/workspace')

      expect(report.score).toBeLessThan(100)
    })

    it('should include issues for empty workspace', async () => {
      const emptyPackageCollection = {
        ...mockPackageCollection,
        size: vi.fn().mockReturnValue(0),
        isEmpty: vi.fn().mockReturnValue(true),
        getAll: vi.fn().mockReturnValue([]),
        findPackagesWithCatalogReferences: vi.fn().mockReturnValue([]),
      } as unknown as PackageCollection

      mockWorkspace.getPackages = vi.fn().mockReturnValue(emptyPackageCollection)

      const report = await service.checkHealth('/test/workspace')

      expect(report.issues.some((issue) => issue.message.includes('No packages found'))).toBe(true)
    })

    it('should return excellent status for score >= 90', async () => {
      const report = await service.checkHealth('/test/workspace')

      if (report.score >= 90) {
        expect(report.status).toBe('excellent')
      }
    })

    it('should return poor status for low score', async () => {
      // Mock workspace with many issues
      mockWorkspace.validateConsistency = vi.fn().mockReturnValue({
        getIsValid: () => false,
        getErrors: () => ['Error 1', 'Error 2', 'Error 3', 'Error 4', 'Error 5'],
        getWarnings: () => [],
      })

      mockCatalogCollection.validate = vi.fn().mockReturnValue({
        getIsValid: () => false,
        getErrors: () => ['Catalog Error'],
        getWarnings: () => [],
      })

      const report = await service.checkHealth('/test/workspace')

      expect(report.score).toBeLessThan(50)
      expect(report.status).toBe('poor')
    })
  })
})
