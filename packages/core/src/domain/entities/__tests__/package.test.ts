/**
 * Package Entity Tests
 */

import { describe, expect, it, vi } from 'vitest'

// Mock @pcu/utils before importing Package
vi.mock('@pcu/utils', () => {
  const ErrorCode = {
    CATALOG_NOT_FOUND: 'CATALOG_NOT_FOUND',
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

  // ValidationResult class for validation methods
  class ValidationResultClass {
    public readonly isValid: boolean
    public readonly errors: string[]
    public readonly warnings: string[]

    constructor(isValid: boolean, errors: string[] = [], warnings: string[] = []) {
      this.isValid = isValid
      this.errors = [...errors]
      this.warnings = [...warnings]
    }

    public getIsValid(): boolean {
      return this.isValid
    }

    public getErrors(): string[] {
      return [...this.errors]
    }

    public getWarnings(): string[] {
      return [...this.warnings]
    }

    public hasErrors(): boolean {
      return this.errors.length > 0
    }

    public hasWarnings(): boolean {
      return this.warnings.length > 0
    }

    public static merge(
      ...results: Array<{ errors: string[]; warnings: string[] }>
    ): ValidationResultClass {
      const allErrors: string[] = []
      const allWarnings: string[] = []
      for (const result of results) {
        allErrors.push(...result.errors)
        allWarnings.push(...result.warnings)
      }
      return new ValidationResultClass(allErrors.length === 0, allErrors, allWarnings)
    }

    public static valid(warnings: string[] = []): ValidationResultClass {
      return new ValidationResultClass(true, [], warnings)
    }

    public static invalid(errors: string[], warnings: string[] = []): ValidationResultClass {
      return new ValidationResultClass(false, errors, warnings)
    }
  }

  return {
    ErrorCode,
    BaseError,
    DomainError,
    CatalogNotFoundError,
    ValidationResultClass,
    isValidPackageName: (name: string) => {
      const packageNameRegex = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
      return packageNameRegex.test(name) && name.length <= 214
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

import { WorkspacePath } from '../../value-objects/workspacePath.js'
import {
  CatalogReference,
  DependencyCollection,
  Package,
  type PackageJsonData,
} from '../package.js'

describe('Package', () => {
  const createMockWorkspacePath = (path: string): WorkspacePath => {
    return WorkspacePath.fromString(path)
  }

  describe('create', () => {
    it('should create package from package.json data', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          lodash: '^4.17.21',
        },
      }

      const pkg = Package.create(
        'pkg-1',
        'test-package',
        createMockWorkspacePath('/test'),
        packageJsonData
      )

      expect(pkg.getId()).toBe('pkg-1')
      expect(pkg.getName()).toBe('test-package')
    })

    it('should extract catalog references from dependencies', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        dependencies: {
          lodash: 'catalog:',
          react: 'catalog:frontend',
        },
        devDependencies: {
          typescript: 'catalog:',
        },
      }

      const pkg = Package.create(
        'pkg-1',
        'test-package',
        createMockWorkspacePath('/test'),
        packageJsonData
      )
      const refs = pkg.getCatalogReferences()

      expect(refs).toHaveLength(3)
      expect(
        refs.some((r) => r.getPackageName() === 'lodash' && r.getCatalogName() === 'default')
      ).toBe(true)
      expect(
        refs.some((r) => r.getPackageName() === 'react' && r.getCatalogName() === 'frontend')
      ).toBe(true)
      expect(
        refs.some((r) => r.getPackageName() === 'typescript' && r.getCatalogName() === 'default')
      ).toBe(true)
    })
  })

  describe('getDependencies', () => {
    it('should return dependency collection', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        dependencies: {
          lodash: '^4.17.21',
        },
        devDependencies: {
          typescript: '^5.0.0',
        },
      }

      const pkg = Package.create(
        'pkg-1',
        'test-package',
        createMockWorkspacePath('/test'),
        packageJsonData
      )
      const deps = pkg.getDependencies()

      expect(deps.getDependenciesByType('dependencies').size).toBe(1)
      expect(deps.getDependenciesByType('devDependencies').size).toBe(1)
    })
  })

  describe('getCatalogDependencies', () => {
    it('should return catalog dependencies', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        dependencies: {
          lodash: 'catalog:',
          express: '^4.18.0',
        },
      }

      const pkg = Package.create(
        'pkg-1',
        'test-package',
        createMockWorkspacePath('/test'),
        packageJsonData
      )
      const catalogDeps = pkg.getCatalogDependencies()

      expect(catalogDeps).toHaveLength(1)
      expect(catalogDeps[0].getPackageName()).toBe('lodash')
    })
  })

  describe('usesCatalogDependency', () => {
    it('should return true when package uses catalog dependency', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        dependencies: {
          lodash: 'catalog:',
        },
      }

      const pkg = Package.create(
        'pkg-1',
        'test-package',
        createMockWorkspacePath('/test'),
        packageJsonData
      )

      expect(pkg.usesCatalogDependency('default', 'lodash')).toBe(true)
    })

    it('should return false when package does not use catalog dependency', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        dependencies: {
          lodash: '^4.17.21',
        },
      }

      const pkg = Package.create(
        'pkg-1',
        'test-package',
        createMockWorkspacePath('/test'),
        packageJsonData
      )

      expect(pkg.usesCatalogDependency('default', 'lodash')).toBe(false)
    })
  })

  describe('updateDependencyFromCatalog', () => {
    it('should throw error when catalog reference not found', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        dependencies: {
          lodash: '^4.17.21',
        },
      }

      const pkg = Package.create(
        'pkg-1',
        'test-package',
        createMockWorkspacePath('/test'),
        packageJsonData
      )

      expect(() => pkg.updateDependencyFromCatalog('default', 'lodash', '4.17.22')).toThrow()
    })
  })

  describe('getDependenciesByType', () => {
    it('should return dependencies of specific type', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        dependencies: {
          lodash: '^4.17.21',
        },
        devDependencies: {
          typescript: '^5.0.0',
        },
        peerDependencies: {
          react: '^18.0.0',
        },
      }

      const pkg = Package.create(
        'pkg-1',
        'test-package',
        createMockWorkspacePath('/test'),
        packageJsonData
      )

      expect(pkg.getDependenciesByType('dependencies').get('lodash')).toBe('^4.17.21')
      expect(pkg.getDependenciesByType('devDependencies').get('typescript')).toBe('^5.0.0')
      expect(pkg.getDependenciesByType('peerDependencies').get('react')).toBe('^18.0.0')
    })
  })

  describe('toPackageJsonData', () => {
    it('should convert back to package.json format', () => {
      const originalData: PackageJsonData = {
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          lodash: '^4.17.21',
        },
        devDependencies: {
          typescript: '^5.0.0',
        },
      }

      const pkg = Package.create(
        'pkg-1',
        'test-package',
        createMockWorkspacePath('/test'),
        originalData
      )
      const result = pkg.toPackageJsonData()

      expect(result.name).toBe('test-package')
      expect(result.version).toBe('1.0.0')
      expect(result.dependencies?.lodash).toBe('^4.17.21')
    })
  })

  describe('validate', () => {
    it('should return valid for valid package', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        dependencies: {
          lodash: '^4.17.21',
        },
      }

      const pkg = Package.create(
        'pkg-1',
        'test-package',
        createMockWorkspacePath('/test'),
        packageJsonData
      )
      const result = pkg.validate()

      expect(result.getIsValid()).toBe(true)
      expect(result.getErrors()).toHaveLength(0)
    })

    it('should return error for invalid package name', () => {
      const packageJsonData: PackageJsonData = {
        name: 'INVALID_PACKAGE_NAME',
        dependencies: {},
      }

      const pkg = Package.create(
        'pkg-1',
        'INVALID_PACKAGE_NAME',
        createMockWorkspacePath('/test'),
        packageJsonData
      )
      const result = pkg.validate()

      expect(result.getIsValid()).toBe(false)
      expect(result.getErrors()).toContainEqual(expect.stringContaining('Invalid package name'))
    })
  })

  describe('equals', () => {
    it('should return true for equal packages', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        dependencies: {},
      }

      const path = createMockWorkspacePath('/test')
      const pkg1 = Package.create('pkg-1', 'test-package', path, packageJsonData)
      const pkg2 = Package.create('pkg-1', 'test-package', path, packageJsonData)

      expect(pkg1.equals(pkg2)).toBe(true)
    })

    it('should return false for packages with different ids', () => {
      const packageJsonData: PackageJsonData = {
        name: 'test-package',
        dependencies: {},
      }

      const path = createMockWorkspacePath('/test')
      const pkg1 = Package.create('pkg-1', 'test-package', path, packageJsonData)
      const pkg2 = Package.create('pkg-2', 'test-package', path, packageJsonData)

      expect(pkg1.equals(pkg2)).toBe(false)
    })
  })
})

describe('CatalogReference', () => {
  describe('constructor and getters', () => {
    it('should store and return values correctly', () => {
      const ref = new CatalogReference('default', 'lodash', 'dependencies')

      expect(ref.getCatalogName()).toBe('default')
      expect(ref.getPackageName()).toBe('lodash')
      expect(ref.getDependencyType()).toBe('dependencies')
    })
  })

  describe('equals', () => {
    it('should return true for equal references', () => {
      const ref1 = new CatalogReference('default', 'lodash', 'dependencies')
      const ref2 = new CatalogReference('default', 'lodash', 'dependencies')

      expect(ref1.equals(ref2)).toBe(true)
    })

    it('should return false for different catalog names', () => {
      const ref1 = new CatalogReference('default', 'lodash', 'dependencies')
      const ref2 = new CatalogReference('frontend', 'lodash', 'dependencies')

      expect(ref1.equals(ref2)).toBe(false)
    })

    it('should return false for different package names', () => {
      const ref1 = new CatalogReference('default', 'lodash', 'dependencies')
      const ref2 = new CatalogReference('default', 'react', 'dependencies')

      expect(ref1.equals(ref2)).toBe(false)
    })

    it('should return false for different dependency types', () => {
      const ref1 = new CatalogReference('default', 'lodash', 'dependencies')
      const ref2 = new CatalogReference('default', 'lodash', 'devDependencies')

      expect(ref1.equals(ref2)).toBe(false)
    })
  })
})

describe('DependencyCollection', () => {
  describe('empty', () => {
    it('should create empty collection', () => {
      const collection = DependencyCollection.empty()

      expect(collection.getDependenciesByType('dependencies').size).toBe(0)
      expect(collection.getDependenciesByType('devDependencies').size).toBe(0)
      expect(collection.getDependenciesByType('peerDependencies').size).toBe(0)
      expect(collection.getDependenciesByType('optionalDependencies').size).toBe(0)
    })
  })

  describe('fromPackageJson', () => {
    it('should create collection from package.json data', () => {
      const data: PackageJsonData = {
        name: 'test',
        dependencies: { lodash: '^4.17.21' },
        devDependencies: { typescript: '^5.0.0' },
        peerDependencies: { react: '^18.0.0' },
        optionalDependencies: { fsevents: '^2.3.0' },
      }

      const collection = DependencyCollection.fromPackageJson(data)

      expect(collection.getDependenciesByType('dependencies').get('lodash')).toBe('^4.17.21')
      expect(collection.getDependenciesByType('devDependencies').get('typescript')).toBe('^5.0.0')
      expect(collection.getDependenciesByType('peerDependencies').get('react')).toBe('^18.0.0')
      expect(collection.getDependenciesByType('optionalDependencies').get('fsevents')).toBe(
        '^2.3.0'
      )
    })

    it('should handle missing dependency types', () => {
      const data: PackageJsonData = {
        name: 'test',
        dependencies: { lodash: '^4.17.21' },
      }

      const collection = DependencyCollection.fromPackageJson(data)

      expect(collection.getDependenciesByType('dependencies').size).toBe(1)
      expect(collection.getDependenciesByType('devDependencies').size).toBe(0)
    })
  })

  describe('getDependenciesByType', () => {
    it('should return a copy of dependencies map', () => {
      const data: PackageJsonData = {
        name: 'test',
        dependencies: { lodash: '^4.17.21' },
      }

      const collection = DependencyCollection.fromPackageJson(data)
      const deps1 = collection.getDependenciesByType('dependencies')
      const deps2 = collection.getDependenciesByType('dependencies')

      // Should return new Map instances
      deps1.set('newpkg', '1.0.0')
      expect(deps2.has('newpkg')).toBe(false)
    })
  })

  describe('updateDependency', () => {
    it('should update existing dependency', () => {
      const data: PackageJsonData = {
        name: 'test',
        dependencies: { lodash: '^4.17.20' },
      }

      const collection = DependencyCollection.fromPackageJson(data)
      collection.updateDependency('dependencies', 'lodash', '^4.17.21')

      expect(collection.getDependenciesByType('dependencies').get('lodash')).toBe('^4.17.21')
    })

    it('should add new dependency', () => {
      const collection = DependencyCollection.empty()
      collection.updateDependency('dependencies', 'lodash', '^4.17.21')

      expect(collection.getDependenciesByType('dependencies').get('lodash')).toBe('^4.17.21')
    })
  })
})
