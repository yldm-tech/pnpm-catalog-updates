/**
 * Workspace Entity Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @pcu/utils before importing Workspace
vi.mock('@pcu/utils', () => {
  const ErrorCode = {
    CATALOG_NOT_FOUND: 'CATALOG_NOT_FOUND',
    WORKSPACE_VALIDATION_ERROR: 'WORKSPACE_VALIDATION_ERROR',
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
        `Catalog "${catalogName}" not found${availableCatalogs?.length ? `. Available: ${availableCatalogs.join(', ')}` : ''}`,
        ErrorCode.CATALOG_NOT_FOUND,
        { catalogName, availableCatalogs },
        cause
      )
    }
  }

  class WorkspaceValidationError extends DomainError {
    constructor(path: string, reason: string, cause?: Error) {
      super(
        `Workspace validation failed at "${path}": ${reason}`,
        ErrorCode.WORKSPACE_VALIDATION_ERROR,
        { path, reason },
        cause
      )
    }
  }

  return {
    ErrorCode,
    BaseError,
    DomainError,
    CatalogNotFoundError,
    WorkspaceValidationError,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

import type { CatalogCollection } from '../../value-objects/catalogCollection.js'
import type { PackageCollection } from '../../value-objects/packageCollection.js'
import { WorkspaceConfig } from '../../value-objects/workspaceConfig.js'
import { WorkspaceId } from '../../value-objects/workspaceId.js'
import { WorkspacePath } from '../../value-objects/workspacePath.js'
import type { Catalog } from '../catalog.js'
import type { Package } from '../package.js'
import { ValidationResult, Workspace } from '../workspace.js'

describe('Workspace', () => {
  let mockCatalogCollection: CatalogCollection
  let mockPackageCollection: PackageCollection
  let mockCatalog: Catalog

  beforeEach(() => {
    // Create mock catalog
    mockCatalog = {
      getId: vi.fn().mockReturnValue('cat-1'),
      getName: vi.fn().mockReturnValue('default'),
      getDependencies: vi
        .fn()
        .mockReturnValue(new Map([['lodash', { toString: () => '^4.17.21' }]])),
      hasDependency: vi.fn().mockReturnValue(true),
      getDependencyVersion: vi.fn().mockReturnValue({ toString: () => '^4.17.21' }),
      updateDependencyVersion: vi.fn(),
      validate: vi.fn().mockReturnValue({
        getIsValid: () => true,
        getErrors: () => [],
        getWarnings: () => [],
      }),
    } as unknown as Catalog

    // Create mock catalog collection
    mockCatalogCollection = {
      get: vi.fn().mockReturnValue(mockCatalog),
      has: vi.fn().mockReturnValue(true),
      getAll: vi.fn().mockReturnValue([mockCatalog]),
      size: vi.fn().mockReturnValue(1),
      isEmpty: vi.fn().mockReturnValue(false),
      getCatalogNames: vi.fn().mockReturnValue(['default']),
      validate: vi.fn().mockReturnValue({
        getIsValid: () => true,
        getErrors: () => [],
        getWarnings: () => [],
      }),
    } as unknown as CatalogCollection

    // Create mock package with catalog references
    const mockPackage = {
      getName: vi.fn().mockReturnValue('test-package'),
      getCatalogReferences: vi.fn().mockReturnValue([
        {
          getCatalogName: () => 'default',
          getPackageName: () => 'lodash',
        },
      ]),
    } as unknown as Package

    // Create mock package collection
    mockPackageCollection = {
      getAll: vi.fn().mockReturnValue([mockPackage]),
      size: vi.fn().mockReturnValue(1),
      isEmpty: vi.fn().mockReturnValue(false),
      findPackagesWithCatalogReferences: vi.fn().mockReturnValue([mockPackage]),
      findPackagesUsingCatalog: vi.fn().mockReturnValue([mockPackage]),
      filterByCatalogDependency: vi.fn().mockReturnValue({
        getAll: () => [mockPackage],
        size: () => 1,
      }),
    } as unknown as PackageCollection
  })

  describe('create', () => {
    it('should create workspace with valid inputs', () => {
      const id = WorkspaceId.generate()
      const path = WorkspacePath.fromString('/test/workspace')
      const config = WorkspaceConfig.createDefault()

      const workspace = Workspace.create(
        id,
        path,
        config,
        mockCatalogCollection,
        mockPackageCollection
      )

      expect(workspace.getId()).toBe(id)
      expect(workspace.getPath()).toBe(path)
      expect(workspace.getConfig()).toBe(config)
    })
  })

  describe('getCatalogs', () => {
    it('should return catalog collection', () => {
      const id = WorkspaceId.generate()
      const path = WorkspacePath.fromString('/test/workspace')
      const config = WorkspaceConfig.createDefault()

      const workspace = Workspace.create(
        id,
        path,
        config,
        mockCatalogCollection,
        mockPackageCollection
      )

      expect(workspace.getCatalogs()).toBe(mockCatalogCollection)
    })
  })

  describe('getPackages', () => {
    it('should return package collection', () => {
      const id = WorkspaceId.generate()
      const path = WorkspacePath.fromString('/test/workspace')
      const config = WorkspaceConfig.createDefault()

      const workspace = Workspace.create(
        id,
        path,
        config,
        mockCatalogCollection,
        mockPackageCollection
      )

      expect(workspace.getPackages()).toBe(mockPackageCollection)
    })
  })

  describe('hasCatalog', () => {
    it('should return true when catalog exists', () => {
      const id = WorkspaceId.generate()
      const path = WorkspacePath.fromString('/test/workspace')
      const config = WorkspaceConfig.createDefault()

      const workspace = Workspace.create(
        id,
        path,
        config,
        mockCatalogCollection,
        mockPackageCollection
      )

      expect(workspace.hasCatalog('default')).toBe(true)
      expect(mockCatalogCollection.has).toHaveBeenCalledWith('default')
    })

    it('should return false when catalog does not exist', () => {
      mockCatalogCollection.has = vi.fn().mockReturnValue(false)

      const id = WorkspaceId.generate()
      const path = WorkspacePath.fromString('/test/workspace')
      const config = WorkspaceConfig.createDefault()

      const workspace = Workspace.create(
        id,
        path,
        config,
        mockCatalogCollection,
        mockPackageCollection
      )

      expect(workspace.hasCatalog('nonexistent')).toBe(false)
    })
  })

  describe('updateCatalogDependency', () => {
    it('should update dependency in catalog', () => {
      const id = WorkspaceId.generate()
      const path = WorkspacePath.fromString('/test/workspace')
      // Create config with 'default' catalog so updateCatalogDependency works
      const config = WorkspaceConfig.fromWorkspaceData({
        packages: ['packages/*'],
        catalog: { lodash: '^4.17.21' },
      })

      const workspace = Workspace.create(
        id,
        path,
        config,
        mockCatalogCollection,
        mockPackageCollection
      )

      workspace.updateCatalogDependency('default', 'lodash', '^4.17.22')

      expect(mockCatalogCollection.get).toHaveBeenCalledWith('default')
      expect(mockCatalog.updateDependencyVersion).toHaveBeenCalledWith('lodash', '^4.17.22')
    })

    it('should throw error when catalog not found', () => {
      mockCatalogCollection.get = vi.fn().mockReturnValue(undefined)

      const id = WorkspaceId.generate()
      const path = WorkspacePath.fromString('/test/workspace')
      const config = WorkspaceConfig.createDefault()

      const workspace = Workspace.create(
        id,
        path,
        config,
        mockCatalogCollection,
        mockPackageCollection
      )

      expect(() => workspace.updateCatalogDependency('nonexistent', 'lodash', '^4.17.22')).toThrow()
    })
  })

  describe('validateConsistency', () => {
    it('should return valid result for consistent workspace', () => {
      const id = WorkspaceId.generate()
      const path = WorkspacePath.fromString('/test/workspace')
      const config = WorkspaceConfig.createDefault()

      const workspace = Workspace.create(
        id,
        path,
        config,
        mockCatalogCollection,
        mockPackageCollection
      )
      const result = workspace.validateConsistency()

      expect(result.getIsValid()).toBe(true)
      expect(result.getErrors()).toHaveLength(0)
    })

    it('should return error when package references unknown catalog', () => {
      // Mock catalog collection to return false for 'has'
      mockCatalogCollection.has = vi.fn().mockReturnValue(false)

      const id = WorkspaceId.generate()
      const path = WorkspacePath.fromString('/test/workspace')
      const config = WorkspaceConfig.createDefault()

      const workspace = Workspace.create(
        id,
        path,
        config,
        mockCatalogCollection,
        mockPackageCollection
      )
      const result = workspace.validateConsistency()

      expect(result.getIsValid()).toBe(false)
      expect(result.getErrors().length).toBeGreaterThan(0)
      expect(result.getErrors()[0]).toContain('unknown catalog')
    })
  })

  describe('getPackagesUsingCatalogDependency', () => {
    it('should return packages using specific catalog dependency', () => {
      const id = WorkspaceId.generate()
      const path = WorkspacePath.fromString('/test/workspace')
      const config = WorkspaceConfig.createDefault()

      const workspace = Workspace.create(
        id,
        path,
        config,
        mockCatalogCollection,
        mockPackageCollection
      )
      const packages = workspace.getPackagesUsingCatalogDependency('default', 'lodash')

      expect(mockPackageCollection.filterByCatalogDependency).toHaveBeenCalledWith(
        'default',
        'lodash'
      )
      expect(packages.size()).toBe(1)
    })
  })
})

describe('ValidationResult', () => {
  describe('constructor', () => {
    it('should create valid result', () => {
      const result = new ValidationResult(true, [], [])

      expect(result.getIsValid()).toBe(true)
      expect(result.getErrors()).toHaveLength(0)
      expect(result.getWarnings()).toHaveLength(0)
    })

    it('should create invalid result with errors', () => {
      const result = new ValidationResult(false, ['Error 1', 'Error 2'], [])

      expect(result.getIsValid()).toBe(false)
      expect(result.getErrors()).toEqual(['Error 1', 'Error 2'])
    })

    it('should create result with warnings', () => {
      const result = new ValidationResult(true, [], ['Warning 1'])

      expect(result.getIsValid()).toBe(true)
      expect(result.getWarnings()).toEqual(['Warning 1'])
    })

    it('should create result with both errors and warnings', () => {
      const result = new ValidationResult(false, ['Error 1'], ['Warning 1'])

      expect(result.getIsValid()).toBe(false)
      expect(result.getErrors()).toEqual(['Error 1'])
      expect(result.getWarnings()).toEqual(['Warning 1'])
    })
  })

  describe('hasErrors', () => {
    it('should return true when there are errors', () => {
      const result = new ValidationResult(false, ['Error 1'], [])
      expect(result.hasErrors()).toBe(true)
    })

    it('should return false when there are no errors', () => {
      const result = new ValidationResult(true, [], [])
      expect(result.hasErrors()).toBe(false)
    })
  })

  describe('hasWarnings', () => {
    it('should return true when there are warnings', () => {
      const result = new ValidationResult(true, [], ['Warning 1'])
      expect(result.hasWarnings()).toBe(true)
    })

    it('should return false when there are no warnings', () => {
      const result = new ValidationResult(true, [], [])
      expect(result.hasWarnings()).toBe(false)
    })
  })
})

describe('WorkspaceConfig', () => {
  describe('createDefault', () => {
    it('should create config with default values', () => {
      const config = WorkspaceConfig.createDefault()

      expect(config.getPackagePatterns()).toEqual(['packages/*'])
    })
  })

  describe('getPackagePatterns', () => {
    it('should return package patterns', () => {
      const config = WorkspaceConfig.createDefault()

      const patterns = config.getPackagePatterns()
      expect(patterns).toContain('packages/*')
    })

    it('should return a copy of patterns array', () => {
      const config = WorkspaceConfig.createDefault()

      const patterns1 = config.getPackagePatterns()
      const patterns2 = config.getPackagePatterns()

      // Should be equal in content
      expect(patterns1).toEqual(patterns2)
      // But not the same reference (defensive copy)
      patterns1.push('extra/*')
      expect(patterns2).not.toContain('extra/*')
    })
  })
})
