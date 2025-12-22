/**
 * Catalog Entity Tests
 */

import { describe, expect, it, vi } from 'vitest'

// Mock @pcu/utils before importing Catalog
vi.mock('@pcu/utils', () => {
  const ErrorCode = {
    INVALID_VERSION_RANGE: 'INVALID_VERSION_RANGE',
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

  class InvalidVersionRangeError extends DomainError {
    constructor(range: string, reason?: string, cause?: Error) {
      super(
        `Invalid version range "${range}"${reason ? `: ${reason}` : ''}`,
        ErrorCode.INVALID_VERSION_RANGE,
        { range, reason },
        cause
      )
    }
  }

  return {
    ErrorCode,
    BaseError,
    DomainError,
    InvalidVersionRangeError,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

import { Catalog, CatalogMode } from '../catalog.js'

describe('Catalog', () => {
  describe('create', () => {
    it('should create catalog with valid dependencies', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
        typescript: '^5.0.0',
      })

      expect(catalog.getId()).toBe('cat-1')
      expect(catalog.getName()).toBe('default')
      expect(catalog.getMode()).toBe(CatalogMode.MANUAL)
    })

    it('should create catalog with custom mode', () => {
      const catalog = Catalog.create('cat-1', 'strict-catalog', {}, CatalogMode.STRICT)

      expect(catalog.getMode()).toBe(CatalogMode.STRICT)
    })

    it('should throw error for invalid version range', () => {
      expect(() =>
        Catalog.create('cat-1', 'default', {
          lodash: 'invalid-version',
        })
      ).toThrow()
    })
  })

  describe('getDependencies', () => {
    it('should return all dependencies', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
        react: '^18.0.0',
      })

      const deps = catalog.getDependencies()
      expect(deps.size).toBe(2)
    })
  })

  describe('getPackageNames', () => {
    it('should return list of package names', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
        typescript: '^5.0.0',
      })

      const names = catalog.getPackageNames()
      expect(names).toContain('lodash')
      expect(names).toContain('typescript')
      expect(names).toHaveLength(2)
    })
  })

  describe('hasDependency', () => {
    it('should return true for existing dependency', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
      })

      expect(catalog.hasDependency('lodash')).toBe(true)
    })

    it('should return false for non-existing dependency', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
      })

      expect(catalog.hasDependency('react')).toBe(false)
    })
  })

  describe('getDependencyVersion', () => {
    it('should return version range for existing dependency', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
      })

      const version = catalog.getDependencyVersion('lodash')
      expect(version).not.toBeNull()
      expect(version?.toString()).toBe('^4.17.21')
    })

    it('should return null for non-existing dependency', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
      })

      expect(catalog.getDependencyVersion('react')).toBeNull()
    })
  })

  describe('updateDependencyVersion', () => {
    it('should update existing dependency version', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.20',
      })

      catalog.updateDependencyVersion('lodash', '^4.17.21')
      expect(catalog.getDependencyVersion('lodash')?.toString()).toBe('^4.17.21')
    })

    it('should add new dependency', () => {
      const catalog = Catalog.create('cat-1', 'default', {})

      catalog.updateDependencyVersion('lodash', '^4.17.21')
      expect(catalog.hasDependency('lodash')).toBe(true)
    })

    it('should throw error for invalid version range', () => {
      const catalog = Catalog.create('cat-1', 'default', {})

      expect(() => catalog.updateDependencyVersion('lodash', 'invalid')).toThrow()
    })
  })

  describe('removeDependency', () => {
    it('should remove existing dependency', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
        react: '^18.0.0',
      })

      const removed = catalog.removeDependency('lodash')
      expect(removed).toBe(true)
      expect(catalog.hasDependency('lodash')).toBe(false)
    })

    it('should return false for non-existing dependency', () => {
      const catalog = Catalog.create('cat-1', 'default', {})

      const removed = catalog.removeDependency('lodash')
      expect(removed).toBe(false)
    })
  })

  describe('checkVersionCompatibility', () => {
    it('should return true for compatible version', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.0',
      })

      expect(catalog.checkVersionCompatibility('lodash', '^4.17.21')).toBe(true)
    })

    it('should return false for incompatible version', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.0',
      })

      expect(catalog.checkVersionCompatibility('lodash', '^5.0.0')).toBe(false)
    })

    it('should return false for non-existing dependency', () => {
      const catalog = Catalog.create('cat-1', 'default', {})

      expect(catalog.checkVersionCompatibility('lodash', '^4.17.21')).toBe(false)
    })
  })

  describe('validate', () => {
    it('should return valid result for valid catalog', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
        react: '^18.0.0',
      })

      const result = catalog.validate()
      expect(result.getIsValid()).toBe(true)
      expect(result.getErrors()).toHaveLength(0)
    })

    it('should warn for empty catalog', () => {
      const catalog = Catalog.create('cat-1', 'empty', {})

      const result = catalog.validate()
      expect(result.getWarnings()).toContainEqual(expect.stringContaining('empty'))
    })

    it('should warn for wildcard versions', () => {
      const catalog = Catalog.create('cat-1', 'default', {
        lodash: '*',
      })

      const result = catalog.validate()
      expect(result.getWarnings()).toContainEqual(expect.stringContaining('wildcard'))
    })

    it('should error for invalid package name', () => {
      // Create catalog manually with invalid package name
      const catalog = Catalog.create('cat-1', 'default', {
        INVALID_PKG: '^1.0.0',
      })

      const result = catalog.validate()
      expect(result.getErrors()).toContainEqual(expect.stringContaining('Invalid package name'))
    })
  })

  describe('toPlainObject', () => {
    it('should serialize catalog to plain object', () => {
      const catalog = Catalog.create(
        'cat-1',
        'default',
        {
          lodash: '^4.17.21',
        },
        CatalogMode.STRICT
      )

      const obj = catalog.toPlainObject()
      expect(obj.id).toBe('cat-1')
      expect(obj.name).toBe('default')
      expect(obj.mode).toBe(CatalogMode.STRICT)
      expect(obj.dependencies['lodash']).toBe('^4.17.21')
    })
  })

  describe('fromPlainObject', () => {
    it('should deserialize catalog from plain object', () => {
      const data = {
        id: 'cat-1',
        name: 'default',
        dependencies: { lodash: '^4.17.21' },
        mode: CatalogMode.STRICT,
      }

      const catalog = Catalog.fromPlainObject(data)
      expect(catalog.getId()).toBe('cat-1')
      expect(catalog.getName()).toBe('default')
      expect(catalog.getMode()).toBe(CatalogMode.STRICT)
      expect(catalog.hasDependency('lodash')).toBe(true)
    })
  })

  describe('equals', () => {
    it('should return true for equal catalogs', () => {
      const catalog1 = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
      })
      const catalog2 = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
      })

      expect(catalog1.equals(catalog2)).toBe(true)
    })

    it('should return false for different ids', () => {
      const catalog1 = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
      })
      const catalog2 = Catalog.create('cat-2', 'default', {
        lodash: '^4.17.21',
      })

      expect(catalog1.equals(catalog2)).toBe(false)
    })

    it('should return false for different dependencies', () => {
      const catalog1 = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.21',
      })
      const catalog2 = Catalog.create('cat-1', 'default', {
        lodash: '^4.17.20',
      })

      expect(catalog1.equals(catalog2)).toBe(false)
    })

    it('should return false for different modes', () => {
      const catalog1 = Catalog.create('cat-1', 'default', {}, CatalogMode.MANUAL)
      const catalog2 = Catalog.create('cat-1', 'default', {}, CatalogMode.STRICT)

      expect(catalog1.equals(catalog2)).toBe(false)
    })
  })

  describe('CatalogMode', () => {
    it('should have correct mode values', () => {
      expect(CatalogMode.MANUAL).toBe('manual')
      expect(CatalogMode.STRICT).toBe('strict')
      expect(CatalogMode.PREFER).toBe('prefer')
    })
  })
})
