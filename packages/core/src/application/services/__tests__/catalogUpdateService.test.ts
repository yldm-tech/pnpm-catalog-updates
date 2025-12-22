/**
 * Catalog Update Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../../domain/entities/catalog.js'
import type { CatalogCollection } from '../../../domain/entities/catalogCollection.js'
import type { Workspace } from '../../../domain/entities/workspace.js'
import type { WorkspaceRepository } from '../../../domain/repositories/workspaceRepository.js'
import type { NpmRegistryService } from '../../../infrastructure/external-services/npmRegistryService.js'

// Use vi.hoisted to ensure mocks are available during vi.mock hoisting
const mocks = vi.hoisted(() => ({
  getPackageConfig: vi.fn(),
  loadConfig: vi.fn(),
  handleSecurityCheckFailure: vi.fn(),
  handlePackageQueryFailure: vi.fn(),
}))

vi.mock('@pcu/utils', () => ({
  ConfigLoader: {
    loadConfig: mocks.loadConfig,
    getPackageConfig: mocks.getPackageConfig,
  },
  UserFriendlyErrorHandler: {
    handleSecurityCheckFailure: mocks.handleSecurityCheckFailure,
    handlePackageQueryFailure: mocks.handlePackageQueryFailure,
  },
}))

// Import types separately (static import for types is allowed)
import type { CheckOptions, UpdateOptions } from '../catalogUpdateService.js'

// Import after mock setup
const { CatalogUpdateService } = await import('../catalogUpdateService.js')

describe('CatalogUpdateService', () => {
  let service: InstanceType<typeof CatalogUpdateService>
  let mockWorkspaceRepository: WorkspaceRepository
  let mockRegistryService: NpmRegistryService
  let mockWorkspace: Workspace
  let mockCatalog: Catalog
  let mockCatalogCollection: CatalogCollection

  const createMockCatalog = (name: string, dependencies: Map<string, string>): Catalog =>
    ({
      getName: vi.fn().mockReturnValue(name),
      getDependencies: vi.fn().mockReturnValue(dependencies),
      hasDependency: vi.fn((pkg: string) => dependencies.has(pkg)),
      getDependencyVersion: vi.fn((pkg: string) => dependencies.get(pkg)),
      setDependency: vi.fn(),
      removeDependency: vi.fn(),
    }) as unknown as Catalog

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock return values
    mocks.getPackageConfig.mockReturnValue({
      shouldUpdate: true,
      requireConfirmation: false,
      autoUpdate: true,
      groupUpdate: false,
    })

    mocks.loadConfig.mockReturnValue({
      advanced: {},
      monorepo: {},
      security: { notifyOnSecurityUpdate: false },
    })

    // Create mock dependencies map
    const mockDependencies = new Map<string, string>([
      ['lodash', '^4.17.20'],
      ['typescript', '^5.0.0'],
      ['react', '^18.0.0'],
    ])

    // Create mock catalog
    mockCatalog = createMockCatalog('default', mockDependencies)

    // Create mock catalog collection
    mockCatalogCollection = {
      get: vi.fn().mockReturnValue(mockCatalog),
      getAll: vi.fn().mockReturnValue([mockCatalog]),
      has: vi.fn().mockReturnValue(true),
      size: vi.fn().mockReturnValue(1),
    } as unknown as CatalogCollection

    // Create mock workspace
    mockWorkspace = {
      getId: vi.fn().mockReturnValue({ value: 'workspace-1' }),
      getPath: vi.fn().mockReturnValue({
        toString: () => '/test/workspace',
        getDirectoryName: () => 'workspace',
      }),
      getName: vi.fn().mockReturnValue('test-workspace'),
      getCatalogs: vi.fn().mockReturnValue(mockCatalogCollection),
      getPackages: vi.fn().mockReturnValue([]),
      updateCatalogDependency: vi.fn(),
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

    // Create mock registry service
    mockRegistryService = {
      getLatestVersion: vi.fn().mockImplementation(async (packageName: string) => {
        const versions: Record<string, string> = {
          lodash: '4.17.21',
          typescript: '5.3.0',
          react: '18.2.0',
        }
        return versions[packageName] || '1.0.0'
      }),
      checkSecurityVulnerabilities: vi.fn().mockResolvedValue({
        hasVulnerabilities: false,
        vulnerabilities: [],
      }),
      getPackageInfo: vi.fn().mockResolvedValue({
        name: 'test-package',
        version: '1.0.0',
        versions: ['1.0.0'],
      }),
    } as unknown as NpmRegistryService

    // Create service instance
    service = new CatalogUpdateService(mockWorkspaceRepository, mockRegistryService)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('checkOutdatedDependencies', () => {
    it('should return outdated report for workspace', async () => {
      const options: CheckOptions = {
        workspacePath: '/test/workspace',
      }

      const report = await service.checkOutdatedDependencies(options)

      expect(report).toHaveProperty('workspace')
      expect(report).toHaveProperty('catalogs')
      expect(report).toHaveProperty('totalOutdated')
      expect(report).toHaveProperty('hasUpdates')
      expect(report.workspace.path).toBe('/test/workspace')
    })

    it('should throw error when no workspace found', async () => {
      mockWorkspaceRepository.findByPath = vi.fn().mockResolvedValue(null)

      const options: CheckOptions = {
        workspacePath: '/invalid/path',
      }

      await expect(service.checkOutdatedDependencies(options)).rejects.toThrow(
        'No pnpm workspace found'
      )
    })

    it('should filter by catalog name when specified', async () => {
      const options: CheckOptions = {
        workspacePath: '/test/workspace',
        catalogName: 'default',
      }

      await service.checkOutdatedDependencies(options)

      expect(mockCatalogCollection.get).toHaveBeenCalledWith('default')
    })

    it('should throw error when specified catalog not found', async () => {
      mockCatalogCollection.get = vi.fn().mockReturnValue(undefined)

      const options: CheckOptions = {
        workspacePath: '/test/workspace',
        catalogName: 'nonexistent',
      }

      await expect(service.checkOutdatedDependencies(options)).rejects.toThrow(
        'Catalog "nonexistent" not found'
      )
    })

    it('should throw error when no catalogs found', async () => {
      mockCatalogCollection.getAll = vi.fn().mockReturnValue([])

      const options: CheckOptions = {
        workspacePath: '/test/workspace',
      }

      await expect(service.checkOutdatedDependencies(options)).rejects.toThrow(
        'No catalogs found in workspace'
      )
    })
  })

  describe('planUpdates', () => {
    it('should return update plan for workspace', async () => {
      const options: UpdateOptions = {
        workspacePath: '/test/workspace',
      }

      const plan = await service.planUpdates(options)

      expect(plan).toHaveProperty('workspace')
      expect(plan).toHaveProperty('updates')
      expect(plan).toHaveProperty('conflicts')
      expect(plan).toHaveProperty('totalUpdates')
      expect(plan).toHaveProperty('hasConflicts')
    })

    it('should detect version conflicts across catalogs', async () => {
      // Create second catalog with different version
      const mockDependencies2 = new Map<string, string>([['lodash', '^4.17.15']])

      const mockCatalog2 = createMockCatalog('secondary', mockDependencies2)

      mockCatalogCollection.getAll = vi.fn().mockReturnValue([mockCatalog, mockCatalog2])

      const options: UpdateOptions = {
        workspacePath: '/test/workspace',
      }

      const plan = await service.planUpdates(options)

      expect(plan).toHaveProperty('conflicts')
    })
  })

  describe('executeUpdates', () => {
    it('should execute updates from plan', async () => {
      const plan = {
        workspace: {
          path: '/test/workspace',
          name: 'test-workspace',
        },
        updates: [
          {
            catalogName: 'default',
            packageName: 'lodash',
            currentVersion: '4.17.20',
            newVersion: '4.17.21',
            updateType: 'patch' as const,
            reason: 'New patch version available',
            affectedPackages: [],
          },
        ],
        conflicts: [],
        totalUpdates: 1,
        hasConflicts: false,
      }

      const options: UpdateOptions = {
        workspacePath: '/test/workspace',
        dryRun: false,
      }

      const result = await service.executeUpdates(plan, options)

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('updatedDependencies')
      expect(result).toHaveProperty('skippedDependencies')
      expect(result).toHaveProperty('errors')
      expect(mockWorkspace.updateCatalogDependency).toHaveBeenCalledWith(
        'default',
        'lodash',
        '4.17.21'
      )
    })

    it('should skip updates with conflicts when force is not enabled', async () => {
      const plan = {
        workspace: {
          path: '/test/workspace',
          name: 'test-workspace',
        },
        updates: [
          {
            catalogName: 'default',
            packageName: 'lodash',
            currentVersion: '4.17.20',
            newVersion: '4.17.21',
            updateType: 'patch' as const,
            reason: 'New patch version available',
            affectedPackages: [],
          },
        ],
        conflicts: [
          {
            packageName: 'lodash',
            catalogs: [
              { catalogName: 'default', currentVersion: '4.17.20', proposedVersion: '4.17.21' },
              { catalogName: 'secondary', currentVersion: '4.17.15', proposedVersion: '4.17.21' },
            ],
            recommendation: 'Use 4.17.21',
          },
        ],
        totalUpdates: 1,
        hasConflicts: true,
      }

      const options: UpdateOptions = {
        workspacePath: '/test/workspace',
        force: false,
      }

      const result = await service.executeUpdates(plan, options)

      expect(result.skippedDependencies).toHaveLength(1)
      expect(result.skippedDependencies[0]?.reason).toContain('conflict')
    })

    it('should not save workspace in dry-run mode', async () => {
      const plan = {
        workspace: {
          path: '/test/workspace',
          name: 'test-workspace',
        },
        updates: [
          {
            catalogName: 'default',
            packageName: 'lodash',
            currentVersion: '4.17.20',
            newVersion: '4.17.21',
            updateType: 'patch' as const,
            reason: 'New patch version available',
            affectedPackages: [],
          },
        ],
        conflicts: [],
        totalUpdates: 1,
        hasConflicts: false,
      }

      const options: UpdateOptions = {
        workspacePath: '/test/workspace',
        dryRun: true,
      }

      await service.executeUpdates(plan, options)

      expect(mockWorkspaceRepository.save).not.toHaveBeenCalled()
    })

    it('should handle update errors gracefully', async () => {
      mockWorkspace.updateCatalogDependency = vi.fn().mockImplementation(() => {
        throw new Error('Update failed')
      })

      const plan = {
        workspace: {
          path: '/test/workspace',
          name: 'test-workspace',
        },
        updates: [
          {
            catalogName: 'default',
            packageName: 'lodash',
            currentVersion: '4.17.20',
            newVersion: '4.17.21',
            updateType: 'patch' as const,
            reason: 'New patch version available',
            affectedPackages: [],
          },
        ],
        conflicts: [],
        totalUpdates: 1,
        hasConflicts: false,
      }

      const options: UpdateOptions = {
        workspacePath: '/test/workspace',
      }

      const result = await service.executeUpdates(plan, options)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]?.error).toContain('Update failed')
    })
  })

  describe('constructor and dependencies', () => {
    it('should accept workspace repository and registry service', () => {
      const newService = new CatalogUpdateService(mockWorkspaceRepository, mockRegistryService)

      expect(newService).toBeInstanceOf(CatalogUpdateService)
    })
  })
})
