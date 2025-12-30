/**
 * Catalog Update Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted to define mocks inline (must be before any imports that use these mocks)
const mocks = vi.hoisted(() => ({
  getPackageConfig: vi.fn(),
  loadConfig: vi.fn(),
  loadConfigAsync: vi.fn(),
  handleSecurityCheckFailure: vi.fn(),
  handlePackageQueryFailure: vi.fn(),
  handleRetryAttempt: vi.fn(),
  formatError: vi.fn((e: Error) => e.message),
  parallelLimit: vi.fn(
    async (items: [string, unknown][], callback: (item: [string, unknown]) => Promise<void>) => {
      for (const item of items) {
        await callback(item)
      }
    }
  ),
}))

// Import shared mock utilities after hoisted block
import {
  createMockCatalogCollection,
  createMockRegistryService,
  createMockWorkspace,
  createMockWorkspaceRepository,
  createMockCatalog as createSharedMockCatalog,
  setupDefaultMockReturns,
} from '../../../__tests__/shared/mockUtils.js'

// Inline @pcu/utils mock (cannot use imported factory in vi.mock due to hoisting)
vi.mock('@pcu/utils', () => {
  const ErrorCode = {
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
    CATALOG_NOT_FOUND: 'CATALOG_NOT_FOUND',
    PACKAGE_NOT_FOUND: 'PACKAGE_NOT_FOUND',
    WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  }

  class BaseError extends Error {
    code: string
    context: Record<string, unknown>
    cause?: Error
    constructor(
      message: string,
      code: string,
      context: Record<string, unknown> = {},
      cause?: Error
    ) {
      super(message)
      this.name = this.constructor.name
      this.code = code
      this.context = context
      this.cause = cause
    }
  }

  class DomainError extends BaseError {}

  class CatalogNotFoundError extends DomainError {
    constructor(catalogName: string, availableCatalogs?: string[], cause?: Error) {
      super(
        `Catalog "${catalogName}" not found${availableCatalogs?.length ? `. Available catalogs: ${availableCatalogs.join(', ')}` : ''}`,
        ErrorCode.CATALOG_NOT_FOUND,
        { catalogName, availableCatalogs },
        cause
      )
    }
  }

  class WorkspaceNotFoundError extends DomainError {
    constructor(path: string, cause?: Error) {
      super(`No pnpm workspace found at "${path}"`, ErrorCode.WORKSPACE_NOT_FOUND, { path }, cause)
    }
  }

  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    setLevel: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }

  return {
    ErrorCode,
    BaseError,
    DomainError,
    CatalogNotFoundError,
    WorkspaceNotFoundError,
    logger,
    createLogger: vi.fn(() => logger),
    Logger: {
      getLogger: vi.fn(() => logger),
      resetAllLoggers: vi.fn(),
      instances: new Map(),
    },
    UserFriendlyErrorHandler: {
      handleSecurityCheckFailure: mocks.handleSecurityCheckFailure,
      handlePackageQueryFailure: mocks.handlePackageQueryFailure,
      handleRetryAttempt: mocks.handleRetryAttempt,
      formatError: mocks.formatError,
    },
    ConfigLoader: {
      loadConfig: mocks.loadConfigAsync,
      loadConfigSync: mocks.loadConfig,
      getPackageConfig: mocks.getPackageConfig,
    },
    getConfig: vi.fn(() => ({ getConfig: vi.fn(() => ({ logLevel: 'info' })) })),
    ConfigManager: vi.fn(),
    parallelLimit: mocks.parallelLimit,
    toError: vi.fn((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
    timeout: vi.fn(async <T>(promise: Promise<T>, _ms: number, _message?: string): Promise<T> => {
      return promise
    }),
  }
})

// Import types separately (static import for types is allowed)
import type { CheckOptions, UpdateOptions } from '../catalogUpdateService.js'

// Import after mock setup
const { CatalogUpdateService } = await import('../catalogUpdateService.js')

describe('CatalogUpdateService', () => {
  let service: InstanceType<typeof CatalogUpdateService>
  let mockWorkspaceRepository: ReturnType<typeof createMockWorkspaceRepository>
  let mockRegistryService: ReturnType<typeof createMockRegistryService>
  let mockWorkspace: ReturnType<typeof createMockWorkspace>
  let mockCatalog: ReturnType<typeof createSharedMockCatalog>
  let mockCatalogCollection: ReturnType<typeof createMockCatalogCollection>

  // Helper to create catalog with specific dependencies (uses shared factory)
  const createMockCatalog = (name: string, dependencies: Map<string, string>) =>
    createSharedMockCatalog(name, dependencies)

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock return values using shared utility
    setupDefaultMockReturns(mocks)

    // Create mock dependencies map
    const mockDependencies = new Map<string, string>([
      ['lodash', '^4.17.20'],
      ['typescript', '^5.0.0'],
      ['react', '^18.0.0'],
    ])

    // Create mock catalog using shared factory
    mockCatalog = createMockCatalog('default', mockDependencies)

    // Create mock catalog collection using shared factory
    mockCatalogCollection = createMockCatalogCollection([mockCatalog as never])

    // Create mock workspace using shared factory (with custom catalog collection)
    mockWorkspace = createMockWorkspace('/test/workspace', 'test-workspace')
    mockWorkspace.getCatalogs = vi.fn().mockReturnValue(mockCatalogCollection)
    mockWorkspace.getPackages = vi.fn().mockReturnValue([])
    mockWorkspace.updateCatalogDependency = vi.fn()

    // Create mock workspace repository using shared factory
    mockWorkspaceRepository = createMockWorkspaceRepository(mockWorkspace as never)

    // Create mock registry service using shared factory
    mockRegistryService = createMockRegistryService({
      lodash: '4.17.21',
      typescript: '5.3.0',
      react: '18.2.0',
    })

    // Create service instance
    service = new CatalogUpdateService(
      mockWorkspaceRepository as never,
      mockRegistryService as never
    )
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
      // getByPath throws WorkspaceNotFoundError when workspace not found
      mockWorkspaceRepository.getByPath = vi
        .fn()
        .mockRejectedValue(new Error('No pnpm workspace found at "/invalid/path"'))

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
        'Catalog "nonexistent" not found. Available catalogs: default'
      )
    })

    it('should throw error when no catalogs found', async () => {
      mockCatalogCollection.getAll = vi.fn().mockReturnValue([])
      mockCatalogCollection.getCatalogNames = vi.fn().mockReturnValue([])

      const options: CheckOptions = {
        workspacePath: '/test/workspace',
      }

      await expect(service.checkOutdatedDependencies(options)).rejects.toThrow(
        'Catalog "default" not found'
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
