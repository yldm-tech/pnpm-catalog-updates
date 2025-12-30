/**
 * UpdatePlanService Tests
 *
 * TEST-002: Unit tests for UpdatePlanService
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Setup mocks before imports using inline hoisted mock controls
const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  getPackageConfig: vi.fn(),
  handlePackageQueryFailure: vi.fn(),
}))

vi.mock('@pcu/utils', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    setLevel: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }

  // Mock translations for i18n t() function
  const mockTranslations: Record<string, string> = {
    'update.reason.security': 'Security update available',
    'update.reason.major': 'Major version update available',
    'update.reason.minor': 'Minor version update available',
    'update.reason.patch': 'Patch version update available',
    'update.reason.default': 'Update available',
  }

  return {
    logger: mockLogger,
    t: vi.fn((key: string) => mockTranslations[key] ?? key),
    UserFriendlyErrorHandler: {
      handlePackageQueryFailure: mocks.handlePackageQueryFailure,
    },
    ConfigLoader: {
      loadConfig: mocks.loadConfig,
      getPackageConfig: mocks.getPackageConfig,
    },
  }
})

// Import after mocks
const { UpdatePlanService } = await import('../updatePlanService.js')

// Mock types
interface MockWorkspaceRepository {
  findByPath: ReturnType<typeof vi.fn>
}

interface MockRegistryService {
  getPackageVersions: ReturnType<typeof vi.fn>
  batchQueryVersions: ReturnType<typeof vi.fn>
}

interface MockCheckService {
  checkOutdatedDependencies: ReturnType<typeof vi.fn>
}

interface MockCatalog {
  getName: ReturnType<typeof vi.fn>
  getDependencyVersion: ReturnType<typeof vi.fn>
}

interface MockWorkspace {
  getCatalogs: ReturnType<typeof vi.fn>
  getPackagesUsingCatalogDependency: ReturnType<typeof vi.fn>
}

describe('UpdatePlanService', () => {
  let service: InstanceType<typeof UpdatePlanService>
  let mockWorkspaceRepository: MockWorkspaceRepository
  let mockRegistryService: MockRegistryService
  let mockCheckService: MockCheckService

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock returns
    mocks.loadConfig.mockResolvedValue({
      include: [],
      exclude: [],
      defaults: {},
      advanced: { concurrency: 8 },
      monorepo: { syncVersions: [], catalogPriority: ['default'] },
    })
    mocks.getPackageConfig.mockReturnValue({
      shouldUpdate: true,
      requireConfirmation: false,
      autoUpdate: true,
      groupUpdate: false,
    })

    // Create mock services
    mockWorkspaceRepository = {
      findByPath: vi.fn(),
    }

    mockRegistryService = {
      getPackageVersions: vi.fn(),
      batchQueryVersions: vi.fn().mockResolvedValue({
        results: new Map(),
        failures: [],
      }),
    }

    mockCheckService = {
      checkOutdatedDependencies: vi.fn(),
    }

    // Create service instance
    service = new UpdatePlanService(
      mockWorkspaceRepository as unknown as Parameters<typeof UpdatePlanService>[0],
      mockRegistryService as unknown as Parameters<typeof UpdatePlanService>[1],
      mockCheckService as unknown as Parameters<typeof UpdatePlanService>[2]
    )
  })

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined()
    })
  })

  describe('planUpdates', () => {
    it('should return update plan from outdated report', async () => {
      mockCheckService.checkOutdatedDependencies.mockResolvedValue({
        workspace: { path: '/test/workspace', name: 'test-workspace' },
        catalogs: [
          {
            catalogName: 'default',
            outdatedDependencies: [
              {
                packageName: 'lodash',
                currentVersion: '4.17.20',
                latestVersion: '4.17.21',
                updateType: 'patch',
                isSecurityUpdate: false,
                affectedPackages: ['package-a'],
              },
            ],
          },
        ],
        totalOutdated: 1,
      })

      const plan = await service.planUpdates({
        workspacePath: '/test/workspace',
      })

      expect(plan).toBeDefined()
      expect(plan.workspace.path).toBe('/test/workspace')
      expect(plan.updates).toHaveLength(1)
      expect(plan.updates[0].packageName).toBe('lodash')
      expect(plan.updates[0].newVersion).toBe('4.17.21')
      expect(plan.totalUpdates).toBe(1)
      expect(plan.hasConflicts).toBe(false)
    })

    it('should include package config in planned updates', async () => {
      mocks.getPackageConfig.mockReturnValue({
        shouldUpdate: true,
        requireConfirmation: true,
        autoUpdate: false,
        groupUpdate: true,
      })

      mockCheckService.checkOutdatedDependencies.mockResolvedValue({
        workspace: { path: '/test/workspace', name: 'test-workspace' },
        catalogs: [
          {
            catalogName: 'default',
            outdatedDependencies: [
              {
                packageName: 'typescript',
                currentVersion: '5.0.0',
                latestVersion: '5.3.0',
                updateType: 'minor',
                isSecurityUpdate: false,
                affectedPackages: [],
              },
            ],
          },
        ],
        totalOutdated: 1,
      })

      const plan = await service.planUpdates({
        workspacePath: '/test/workspace',
      })

      expect(plan.updates[0].requireConfirmation).toBe(true)
      expect(plan.updates[0].autoUpdate).toBe(false)
      expect(plan.updates[0].groupUpdate).toBe(true)
    })

    it('should detect conflicts when same package has different versions', async () => {
      mockCheckService.checkOutdatedDependencies.mockResolvedValue({
        workspace: { path: '/test/workspace', name: 'test-workspace' },
        catalogs: [
          {
            catalogName: 'default',
            outdatedDependencies: [
              {
                packageName: 'lodash',
                currentVersion: '4.17.20',
                latestVersion: '4.17.21',
                updateType: 'patch',
                isSecurityUpdate: false,
                affectedPackages: [],
              },
            ],
          },
          {
            catalogName: 'secondary',
            outdatedDependencies: [
              {
                packageName: 'lodash',
                currentVersion: '4.17.18',
                latestVersion: '4.17.22',
                updateType: 'patch',
                isSecurityUpdate: false,
                affectedPackages: [],
              },
            ],
          },
        ],
        totalOutdated: 2,
      })

      const plan = await service.planUpdates({
        workspacePath: '/test/workspace',
      })

      // Should have resolved the conflict using catalog priority
      expect(plan.updates).toHaveLength(2)
    })

    it('should return empty plan when no outdated dependencies', async () => {
      mockCheckService.checkOutdatedDependencies.mockResolvedValue({
        workspace: { path: '/test/workspace', name: 'test-workspace' },
        catalogs: [],
        totalOutdated: 0,
      })

      const plan = await service.planUpdates({
        workspacePath: '/test/workspace',
      })

      expect(plan.updates).toHaveLength(0)
      expect(plan.totalUpdates).toBe(0)
      expect(plan.hasConflicts).toBe(false)
    })
  })

  describe('getUpdateReason', () => {
    it('should return security update reason for security updates', () => {
      const outdated = {
        packageName: 'lodash',
        currentVersion: '4.17.20',
        latestVersion: '4.17.21',
        updateType: 'patch' as const,
        isSecurityUpdate: true,
        affectedPackages: [],
      }

      const reason = service.getUpdateReason(outdated)

      expect(reason).toBe('Security update available')
    })

    it('should return major update reason', () => {
      const outdated = {
        packageName: 'lodash',
        currentVersion: '4.17.20',
        latestVersion: '5.0.0',
        updateType: 'major' as const,
        isSecurityUpdate: false,
        affectedPackages: [],
      }

      const reason = service.getUpdateReason(outdated)

      expect(reason).toBe('Major version update available')
    })

    it('should return minor update reason', () => {
      const outdated = {
        packageName: 'lodash',
        currentVersion: '4.17.20',
        latestVersion: '4.18.0',
        updateType: 'minor' as const,
        isSecurityUpdate: false,
        affectedPackages: [],
      }

      const reason = service.getUpdateReason(outdated)

      expect(reason).toBe('Minor version update available')
    })

    it('should return patch update reason', () => {
      const outdated = {
        packageName: 'lodash',
        currentVersion: '4.17.20',
        latestVersion: '4.17.21',
        updateType: 'patch' as const,
        isSecurityUpdate: false,
        affectedPackages: [],
      }

      const reason = service.getUpdateReason(outdated)

      expect(reason).toBe('Patch version update available')
    })
  })

  describe('resolveVersionConflict', () => {
    it('should resolve conflict using catalog priority', () => {
      const packageUpdates = [
        {
          catalogName: 'default',
          packageName: 'lodash',
          currentVersion: '4.17.20',
          newVersion: '4.17.21',
          updateType: 'patch' as const,
          reason: 'Update',
          affectedPackages: [],
        },
        {
          catalogName: 'secondary',
          packageName: 'lodash',
          currentVersion: '4.17.18',
          newVersion: '4.17.22',
          updateType: 'patch' as const,
          reason: 'Update',
          affectedPackages: [],
        },
      ]

      const conflict = service.resolveVersionConflict('lodash', packageUpdates, [
        'default',
        'secondary',
      ])

      // After resolution, secondary catalog should use default's version
      expect(packageUpdates[1].newVersion).toBe('4.17.21')
      expect(conflict).toBeNull() // Conflict resolved, no unresolved conflict
    })

    it('should use first catalog when priority catalog not found', () => {
      const packageUpdates = [
        {
          catalogName: 'other',
          packageName: 'lodash',
          currentVersion: '4.17.20',
          newVersion: '4.17.21',
          updateType: 'patch' as const,
          reason: 'Update',
          affectedPackages: [],
        },
        {
          catalogName: 'another',
          packageName: 'lodash',
          currentVersion: '4.17.18',
          newVersion: '4.17.22',
          updateType: 'patch' as const,
          reason: 'Update',
          affectedPackages: [],
        },
      ]

      service.resolveVersionConflict('lodash', packageUpdates, ['default', 'secondary'])

      // Should use first catalog's version
      expect(packageUpdates[1].newVersion).toBe('4.17.21')
    })

    it('should return null when no conflict after resolution', () => {
      const packageUpdates = [
        {
          catalogName: 'default',
          packageName: 'lodash',
          currentVersion: '4.17.20',
          newVersion: '4.17.21',
          updateType: 'patch' as const,
          reason: 'Update',
          affectedPackages: [],
        },
        {
          catalogName: 'secondary',
          packageName: 'lodash',
          currentVersion: '4.17.18',
          newVersion: '4.17.21', // Same version - no conflict
          updateType: 'patch' as const,
          reason: 'Update',
          affectedPackages: [],
        },
      ]

      const conflict = service.resolveVersionConflict('lodash', packageUpdates, ['default'])

      expect(conflict).toBeNull()
    })
  })

  describe('createSyncVersionUpdates', () => {
    it('should create sync updates for packages in multiple catalogs', async () => {
      const mockCatalog1: MockCatalog = {
        getName: vi.fn().mockReturnValue('default'),
        getDependencyVersion: vi.fn().mockReturnValue({
          getMinVersion: vi.fn().mockReturnValue({
            toString: () => '4.17.20',
          }),
        }),
      }

      const mockCatalog2: MockCatalog = {
        getName: vi.fn().mockReturnValue('secondary'),
        getDependencyVersion: vi.fn().mockReturnValue({
          getMinVersion: vi.fn().mockReturnValue({
            toString: () => '4.17.18',
          }),
        }),
      }

      const mockWorkspace: MockWorkspace = {
        getCatalogs: vi.fn().mockReturnValue({
          getAll: vi.fn().mockReturnValue([mockCatalog1, mockCatalog2]),
        }),
        getPackagesUsingCatalogDependency: vi.fn().mockReturnValue({
          getPackageNames: vi.fn().mockReturnValue(['package-a']),
        }),
      }

      const existingUpdates = [
        {
          catalogName: 'default',
          packageName: 'lodash',
          currentVersion: '4.17.20',
          newVersion: '4.17.21',
          updateType: 'patch' as const,
          reason: 'Update',
          affectedPackages: ['package-a'],
        },
      ]

      const syncUpdates = await service.createSyncVersionUpdates(
        ['lodash'],
        mockWorkspace as unknown as Parameters<typeof service.createSyncVersionUpdates>[1],
        existingUpdates
      )

      // Should create sync update for secondary catalog
      expect(syncUpdates).toHaveLength(1)
      expect(syncUpdates[0].catalogName).toBe('secondary')
      expect(syncUpdates[0].newVersion).toBe('4.17.21')
      expect(syncUpdates[0].reason).toContain('Sync version')
    })

    it('should skip packages only in one catalog', async () => {
      const mockCatalog: MockCatalog = {
        getName: vi.fn().mockReturnValue('default'),
        getDependencyVersion: vi.fn().mockReturnValue({
          getMinVersion: vi.fn().mockReturnValue({
            toString: () => '4.17.20',
          }),
        }),
      }

      const mockWorkspace: MockWorkspace = {
        getCatalogs: vi.fn().mockReturnValue({
          getAll: vi.fn().mockReturnValue([mockCatalog]),
        }),
        getPackagesUsingCatalogDependency: vi.fn().mockReturnValue({
          getPackageNames: vi.fn().mockReturnValue([]),
        }),
      }

      const syncUpdates = await service.createSyncVersionUpdates(
        ['lodash'],
        mockWorkspace as unknown as Parameters<typeof service.createSyncVersionUpdates>[1],
        []
      )

      expect(syncUpdates).toHaveLength(0)
    })

    it('should fetch latest version when no existing update', async () => {
      const mockCatalog1: MockCatalog = {
        getName: vi.fn().mockReturnValue('default'),
        getDependencyVersion: vi.fn().mockReturnValue({
          getMinVersion: vi.fn().mockReturnValue({
            toString: () => '4.17.20',
          }),
        }),
      }

      const mockCatalog2: MockCatalog = {
        getName: vi.fn().mockReturnValue('secondary'),
        getDependencyVersion: vi.fn().mockReturnValue({
          getMinVersion: vi.fn().mockReturnValue({
            toString: () => '4.17.18',
          }),
        }),
      }

      const mockWorkspace: MockWorkspace = {
        getCatalogs: vi.fn().mockReturnValue({
          getAll: vi.fn().mockReturnValue([mockCatalog1, mockCatalog2]),
        }),
        getPackagesUsingCatalogDependency: vi.fn().mockReturnValue({
          getPackageNames: vi.fn().mockReturnValue(['package-a']),
        }),
      }

      mockRegistryService.batchQueryVersions.mockResolvedValue({
        results: new Map([
          [
            'lodash',
            {
              name: 'lodash',
              versions: ['4.17.20', '4.17.21'],
              latestVersion: '4.17.21',
            },
          ],
        ]),
        failures: [],
      })

      const syncUpdates = await service.createSyncVersionUpdates(
        ['lodash'],
        mockWorkspace as unknown as Parameters<typeof service.createSyncVersionUpdates>[1],
        [] // No existing updates
      )

      expect(mockRegistryService.batchQueryVersions).toHaveBeenCalledWith(['lodash'])
      expect(syncUpdates.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle registry errors gracefully', async () => {
      const mockCatalog1: MockCatalog = {
        getName: vi.fn().mockReturnValue('default'),
        getDependencyVersion: vi.fn().mockReturnValue({
          getMinVersion: vi.fn().mockReturnValue({
            toString: () => '4.17.20',
          }),
        }),
      }

      const mockCatalog2: MockCatalog = {
        getName: vi.fn().mockReturnValue('secondary'),
        getDependencyVersion: vi.fn().mockReturnValue({
          getMinVersion: vi.fn().mockReturnValue({
            toString: () => '4.17.18',
          }),
        }),
      }

      const mockWorkspace: MockWorkspace = {
        getCatalogs: vi.fn().mockReturnValue({
          getAll: vi.fn().mockReturnValue([mockCatalog1, mockCatalog2]),
        }),
        getPackagesUsingCatalogDependency: vi.fn().mockReturnValue({
          getPackageNames: vi.fn().mockReturnValue([]),
        }),
      }

      // batchQueryVersions returns failures in the response instead of throwing
      mockRegistryService.batchQueryVersions.mockResolvedValue({
        results: new Map(),
        failures: [{ packageName: 'lodash', error: new Error('Network error') }],
      })

      const syncUpdates = await service.createSyncVersionUpdates(
        ['lodash'],
        mockWorkspace as unknown as Parameters<typeof service.createSyncVersionUpdates>[1],
        []
      )

      // No sync updates should be created when version query fails
      expect(syncUpdates).toHaveLength(0)
    })
  })
})
