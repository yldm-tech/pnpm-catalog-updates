/**
 * Custom Error Classes Tests
 */

import { describe, expect, it } from 'vitest'
import {
  AIAnalysisError,
  ApplicationError,
  // Base classes
  BaseError,
  CacheError,
  CatalogNotFoundError,
  ConfigurationError,
  DomainError,
  // Enums
  ErrorCode,
  ExternalServiceError,
  FileSystemError,
  getErrorMessage,
  hasErrorCode,
  ImpactAnalysisError,
  InfrastructureError,
  InvalidVersionError,
  InvalidVersionRangeError,
  isApplicationError,
  // Type guards
  isBaseError,
  isDomainError,
  isInfrastructureError,
  NetworkError,
  PackageNotFoundError,
  // Infrastructure errors
  RegistryError,
  SecurityCheckError,
  // Application errors
  UpdatePlanError,
  // Domain errors
  WorkspaceNotFoundError,
  WorkspaceValidationError,
  // Utilities
  wrapError,
} from '../errors.js'

describe('ErrorCode enum', () => {
  it('should have domain error codes', () => {
    expect(ErrorCode.WORKSPACE_NOT_FOUND).toBe('ERR_WORKSPACE_NOT_FOUND')
    expect(ErrorCode.CATALOG_NOT_FOUND).toBe('ERR_CATALOG_NOT_FOUND')
    expect(ErrorCode.PACKAGE_NOT_FOUND).toBe('ERR_PACKAGE_NOT_FOUND')
    expect(ErrorCode.INVALID_VERSION).toBe('ERR_INVALID_VERSION')
    expect(ErrorCode.INVALID_VERSION_RANGE).toBe('ERR_INVALID_VERSION_RANGE')
    expect(ErrorCode.WORKSPACE_VALIDATION_FAILED).toBe('ERR_WORKSPACE_VALIDATION_FAILED')
  })

  it('should have application error codes', () => {
    expect(ErrorCode.UPDATE_PLAN_FAILED).toBe('ERR_UPDATE_PLAN_FAILED')
    expect(ErrorCode.IMPACT_ANALYSIS_FAILED).toBe('ERR_IMPACT_ANALYSIS_FAILED')
    expect(ErrorCode.AI_ANALYSIS_FAILED).toBe('ERR_AI_ANALYSIS_FAILED')
    expect(ErrorCode.SECURITY_CHECK_FAILED).toBe('ERR_SECURITY_CHECK_FAILED')
    expect(ErrorCode.CONFIGURATION_ERROR).toBe('ERR_CONFIGURATION_ERROR')
  })

  it('should have infrastructure error codes', () => {
    expect(ErrorCode.REGISTRY_ERROR).toBe('ERR_REGISTRY_ERROR')
    expect(ErrorCode.NETWORK_ERROR).toBe('ERR_NETWORK_ERROR')
    expect(ErrorCode.FILE_SYSTEM_ERROR).toBe('ERR_FILE_SYSTEM_ERROR')
    expect(ErrorCode.CACHE_ERROR).toBe('ERR_CACHE_ERROR')
    expect(ErrorCode.EXTERNAL_SERVICE_ERROR).toBe('ERR_EXTERNAL_SERVICE_ERROR')
  })
})

describe('Domain Errors', () => {
  describe('WorkspaceNotFoundError', () => {
    it('should create error with path', () => {
      const error = new WorkspaceNotFoundError('/path/to/workspace')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(BaseError)
      expect(error).toBeInstanceOf(DomainError)
      expect(error).toBeInstanceOf(WorkspaceNotFoundError)
      expect(error.name).toBe('WorkspaceNotFoundError')
      expect(error.message).toBe('No pnpm workspace found at "/path/to/workspace"')
      expect(error.code).toBe(ErrorCode.WORKSPACE_NOT_FOUND)
      expect(error.context).toEqual({ path: '/path/to/workspace' })
      expect(error.timestamp).toBeInstanceOf(Date)
    })

    it('should preserve cause error', () => {
      const cause = new Error('Original error')
      const error = new WorkspaceNotFoundError('/path', cause)

      expect(error.cause).toBe(cause)
    })
  })

  describe('CatalogNotFoundError', () => {
    it('should create error with catalog name', () => {
      const error = new CatalogNotFoundError('react17')

      expect(error.message).toBe('Catalog "react17" not found')
      expect(error.code).toBe(ErrorCode.CATALOG_NOT_FOUND)
      expect(error.context).toEqual({ catalogName: 'react17', availableCatalogs: undefined })
    })

    it('should include available catalogs in message', () => {
      const error = new CatalogNotFoundError('unknown', ['default', 'react17'])

      expect(error.message).toBe(
        'Catalog "unknown" not found. Available catalogs: default, react17'
      )
      expect(error.context).toEqual({
        catalogName: 'unknown',
        availableCatalogs: ['default', 'react17'],
      })
    })
  })

  describe('PackageNotFoundError', () => {
    it('should create error without catalog name', () => {
      const error = new PackageNotFoundError('lodash')

      expect(error.message).toBe('Package "lodash" not found in any catalog')
      expect(error.code).toBe(ErrorCode.PACKAGE_NOT_FOUND)
      expect(error.context).toEqual({ packageName: 'lodash', catalogName: undefined })
    })

    it('should create error with catalog name', () => {
      const error = new PackageNotFoundError('lodash', 'default')

      expect(error.message).toBe('Package "lodash" not found in catalog "default"')
      expect(error.context).toEqual({ packageName: 'lodash', catalogName: 'default' })
    })
  })

  describe('InvalidVersionError', () => {
    it('should create error without reason', () => {
      const error = new InvalidVersionError('abc')

      expect(error.message).toBe('Invalid version "abc"')
      expect(error.code).toBe(ErrorCode.INVALID_VERSION)
      expect(error.context).toEqual({ version: 'abc', reason: undefined })
    })

    it('should create error with reason', () => {
      const error = new InvalidVersionError('', 'Version string cannot be empty')

      expect(error.message).toBe('Invalid version "": Version string cannot be empty')
      expect(error.context).toEqual({ version: '', reason: 'Version string cannot be empty' })
    })
  })

  describe('InvalidVersionRangeError', () => {
    it('should create error without reason', () => {
      const error = new InvalidVersionRangeError('>>>1.0.0')

      expect(error.message).toBe('Invalid version range ">>>1.0.0"')
      expect(error.code).toBe(ErrorCode.INVALID_VERSION_RANGE)
    })

    it('should create error with reason', () => {
      const error = new InvalidVersionRangeError('invalid', 'Unrecognized range format')

      expect(error.message).toBe('Invalid version range "invalid": Unrecognized range format')
    })
  })

  describe('WorkspaceValidationError', () => {
    it('should create error with issues', () => {
      const issues = ['Missing pnpm-workspace.yaml', 'No catalogs defined']
      const error = new WorkspaceValidationError('/path', issues)

      expect(error.message).toBe(
        'Workspace validation failed at "/path": Missing pnpm-workspace.yaml; No catalogs defined'
      )
      expect(error.code).toBe(ErrorCode.WORKSPACE_VALIDATION_FAILED)
      expect(error.context).toEqual({ path: '/path', issues })
    })
  })
})

describe('Application Errors', () => {
  describe('UpdatePlanError', () => {
    it('should create error with reason', () => {
      const error = new UpdatePlanError('No packages to update')

      expect(error).toBeInstanceOf(ApplicationError)
      expect(error.message).toBe('Failed to create update plan: No packages to update')
      expect(error.code).toBe(ErrorCode.UPDATE_PLAN_FAILED)
    })

    it('should include context', () => {
      const error = new UpdatePlanError('Conflict detected', {
        conflictingPackages: ['react', 'react-dom'],
      })

      expect(error.context).toEqual({ conflictingPackages: ['react', 'react-dom'] })
    })
  })

  describe('ImpactAnalysisError', () => {
    it('should create error for package', () => {
      const error = new ImpactAnalysisError('lodash', 'Circular dependency detected')

      expect(error.message).toBe(
        'Impact analysis failed for "lodash": Circular dependency detected'
      )
      expect(error.code).toBe(ErrorCode.IMPACT_ANALYSIS_FAILED)
      expect(error.context).toEqual({
        packageName: 'lodash',
        reason: 'Circular dependency detected',
      })
    })
  })

  describe('AIAnalysisError', () => {
    it('should create error for provider', () => {
      const error = new AIAnalysisError('claude', 'Rate limit exceeded')

      expect(error.message).toBe('AI analysis failed with provider "claude": Rate limit exceeded')
      expect(error.code).toBe(ErrorCode.AI_ANALYSIS_FAILED)
      expect(error.context).toEqual({ provider: 'claude', reason: 'Rate limit exceeded' })
    })
  })

  describe('SecurityCheckError', () => {
    it('should create error for package', () => {
      const error = new SecurityCheckError('vulnerable-pkg', 'Critical vulnerability found')

      expect(error.message).toBe(
        'Security check failed for "vulnerable-pkg": Critical vulnerability found'
      )
      expect(error.code).toBe(ErrorCode.SECURITY_CHECK_FAILED)
    })
  })

  describe('ConfigurationError', () => {
    it('should create error for config key', () => {
      const error = new ConfigurationError('registry.url', 'Invalid URL format')

      expect(error.message).toBe('Configuration error for "registry.url": Invalid URL format')
      expect(error.code).toBe(ErrorCode.CONFIGURATION_ERROR)
      expect(error.context).toEqual({ configKey: 'registry.url', reason: 'Invalid URL format' })
    })
  })
})

describe('Infrastructure Errors', () => {
  describe('RegistryError', () => {
    it('should create error with details', () => {
      const error = new RegistryError('lodash', 'fetch', 'Package not found', 404)

      expect(error).toBeInstanceOf(InfrastructureError)
      expect(error.message).toBe('Registry fetch failed for "lodash": Package not found')
      expect(error.code).toBe(ErrorCode.REGISTRY_ERROR)
      expect(error.context).toEqual({
        packageName: 'lodash',
        operation: 'fetch',
        reason: 'Package not found',
        statusCode: 404,
      })
    })

    it('should work without status code', () => {
      const error = new RegistryError('pkg', 'search', 'Timeout')

      expect(error.context?.statusCode).toBeUndefined()
    })
  })

  describe('NetworkError', () => {
    it('should create error with details', () => {
      const error = new NetworkError('https://registry.npmjs.org', 'Connection refused', 500)

      expect(error.message).toBe(
        'Network request failed for "https://registry.npmjs.org": Connection refused'
      )
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR)
      expect(error.context).toEqual({
        url: 'https://registry.npmjs.org',
        reason: 'Connection refused',
        statusCode: 500,
      })
    })
  })

  describe('FileSystemError', () => {
    it('should create error with details', () => {
      const error = new FileSystemError('/path/to/file', 'read', 'Permission denied')

      expect(error.message).toBe('File system read failed for "/path/to/file": Permission denied')
      expect(error.code).toBe(ErrorCode.FILE_SYSTEM_ERROR)
      expect(error.context).toEqual({
        path: '/path/to/file',
        operation: 'read',
        reason: 'Permission denied',
      })
    })
  })

  describe('CacheError', () => {
    it('should create error with details', () => {
      const error = new CacheError('write', 'Disk full')

      expect(error.message).toBe('Cache write failed: Disk full')
      expect(error.code).toBe(ErrorCode.CACHE_ERROR)
      expect(error.context).toEqual({ operation: 'write', reason: 'Disk full' })
    })
  })

  describe('ExternalServiceError', () => {
    it('should create error with details', () => {
      const error = new ExternalServiceError('GitHub', 'fetch', 'API rate limited')

      expect(error.message).toBe('External service "GitHub" fetch failed: API rate limited')
      expect(error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR)
      expect(error.context).toEqual({
        serviceName: 'GitHub',
        operation: 'fetch',
        reason: 'API rate limited',
      })
    })
  })
})

describe('BaseError functionality', () => {
  it('should have timestamp', () => {
    const before = new Date()
    const error = new WorkspaceNotFoundError('/path')
    const after = new Date()

    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('should have stack trace', () => {
    const error = new WorkspaceNotFoundError('/path')

    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('WorkspaceNotFoundError')
  })

  it('should serialize to JSON', () => {
    const cause = new Error('Original')
    const error = new WorkspaceNotFoundError('/path', cause)
    const json = error.toJSON()

    expect(json.name).toBe('WorkspaceNotFoundError')
    expect(json.message).toBe('No pnpm workspace found at "/path"')
    expect(json.code).toBe(ErrorCode.WORKSPACE_NOT_FOUND)
    expect(json.context).toEqual({ path: '/path' })
    expect(json.timestamp).toBeDefined()
    expect(json.stack).toBeDefined()
    expect(json.cause).toBe('Original')
  })

  it('should serialize nested BaseError cause to JSON', () => {
    const innerError = new PackageNotFoundError('lodash')
    const outerError = new UpdatePlanError('Dependency missing', {}, innerError)
    const json = outerError.toJSON()

    expect(json.cause).toEqual(innerError.toJSON())
  })
})

describe('Type Guards', () => {
  describe('isBaseError', () => {
    it('should return true for BaseError instances', () => {
      expect(isBaseError(new WorkspaceNotFoundError('/path'))).toBe(true)
      expect(isBaseError(new UpdatePlanError('reason'))).toBe(true)
      expect(isBaseError(new NetworkError('url', 'reason'))).toBe(true)
    })

    it('should return false for non-BaseError', () => {
      expect(isBaseError(new Error('generic'))).toBe(false)
      expect(isBaseError('string error')).toBe(false)
      expect(isBaseError(null)).toBe(false)
      expect(isBaseError(undefined)).toBe(false)
      expect(isBaseError({})).toBe(false)
    })
  })

  describe('isDomainError', () => {
    it('should return true for DomainError instances', () => {
      expect(isDomainError(new WorkspaceNotFoundError('/path'))).toBe(true)
      expect(isDomainError(new CatalogNotFoundError('name'))).toBe(true)
      expect(isDomainError(new PackageNotFoundError('pkg'))).toBe(true)
      expect(isDomainError(new InvalidVersionError('v'))).toBe(true)
      expect(isDomainError(new InvalidVersionRangeError('r'))).toBe(true)
      expect(isDomainError(new WorkspaceValidationError('/p', ['i']))).toBe(true)
    })

    it('should return false for non-DomainError', () => {
      expect(isDomainError(new UpdatePlanError('reason'))).toBe(false)
      expect(isDomainError(new NetworkError('url', 'reason'))).toBe(false)
      expect(isDomainError(new Error('generic'))).toBe(false)
    })
  })

  describe('isApplicationError', () => {
    it('should return true for ApplicationError instances', () => {
      expect(isApplicationError(new UpdatePlanError('reason'))).toBe(true)
      expect(isApplicationError(new ImpactAnalysisError('pkg', 'reason'))).toBe(true)
      expect(isApplicationError(new AIAnalysisError('provider', 'reason'))).toBe(true)
      expect(isApplicationError(new SecurityCheckError('pkg', 'reason'))).toBe(true)
      expect(isApplicationError(new ConfigurationError('key', 'reason'))).toBe(true)
    })

    it('should return false for non-ApplicationError', () => {
      expect(isApplicationError(new WorkspaceNotFoundError('/path'))).toBe(false)
      expect(isApplicationError(new NetworkError('url', 'reason'))).toBe(false)
      expect(isApplicationError(new Error('generic'))).toBe(false)
    })
  })

  describe('isInfrastructureError', () => {
    it('should return true for InfrastructureError instances', () => {
      expect(isInfrastructureError(new RegistryError('pkg', 'op', 'reason'))).toBe(true)
      expect(isInfrastructureError(new NetworkError('url', 'reason'))).toBe(true)
      expect(isInfrastructureError(new FileSystemError('/p', 'op', 'reason'))).toBe(true)
      expect(isInfrastructureError(new CacheError('op', 'reason'))).toBe(true)
      expect(isInfrastructureError(new ExternalServiceError('svc', 'op', 'reason'))).toBe(true)
    })

    it('should return false for non-InfrastructureError', () => {
      expect(isInfrastructureError(new WorkspaceNotFoundError('/path'))).toBe(false)
      expect(isInfrastructureError(new UpdatePlanError('reason'))).toBe(false)
      expect(isInfrastructureError(new Error('generic'))).toBe(false)
    })
  })

  describe('hasErrorCode', () => {
    it('should return true for matching error code', () => {
      const error = new WorkspaceNotFoundError('/path')
      expect(hasErrorCode(error, ErrorCode.WORKSPACE_NOT_FOUND)).toBe(true)
    })

    it('should return false for non-matching error code', () => {
      const error = new WorkspaceNotFoundError('/path')
      expect(hasErrorCode(error, ErrorCode.CATALOG_NOT_FOUND)).toBe(false)
    })

    it('should return false for non-BaseError', () => {
      expect(hasErrorCode(new Error('generic'), ErrorCode.WORKSPACE_NOT_FOUND)).toBe(false)
      expect(hasErrorCode('string', ErrorCode.WORKSPACE_NOT_FOUND)).toBe(false)
    })
  })
})

describe('Error Utilities', () => {
  describe('wrapError', () => {
    it('should return BaseError as-is', () => {
      const error = new WorkspaceNotFoundError('/path')
      const wrapped = wrapError(error, WorkspaceNotFoundError, '/other')

      expect(wrapped).toBe(error)
    })

    it('should wrap generic Error', () => {
      const originalError = new Error('Original')
      const wrapped = wrapError(originalError, WorkspaceNotFoundError, '/path')

      expect(wrapped).toBeInstanceOf(WorkspaceNotFoundError)
      expect(wrapped.cause).toBe(originalError)
    })

    it('should wrap string error', () => {
      const wrapped = wrapError('string error', WorkspaceNotFoundError, '/path')

      expect(wrapped).toBeInstanceOf(WorkspaceNotFoundError)
      expect(wrapped.cause?.message).toBe('string error')
    })
  })

  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      expect(getErrorMessage(new Error('test message'))).toBe('test message')
    })

    it('should extract message from BaseError', () => {
      expect(getErrorMessage(new WorkspaceNotFoundError('/path'))).toBe(
        'No pnpm workspace found at "/path"'
      )
    })

    it('should convert non-Error to string', () => {
      expect(getErrorMessage('string error')).toBe('string error')
      expect(getErrorMessage(123)).toBe('123')
      expect(getErrorMessage({ custom: 'error' })).toBe('[object Object]')
      expect(getErrorMessage(null)).toBe('null')
      expect(getErrorMessage(undefined)).toBe('undefined')
    })
  })
})

describe('Error inheritance chain', () => {
  it('should maintain proper inheritance for DomainError', () => {
    const error = new WorkspaceNotFoundError('/path')

    expect(error instanceof Error).toBe(true)
    expect(error instanceof BaseError).toBe(true)
    expect(error instanceof DomainError).toBe(true)
    expect(error instanceof WorkspaceNotFoundError).toBe(true)
    expect(error instanceof ApplicationError).toBe(false)
    expect(error instanceof InfrastructureError).toBe(false)
  })

  it('should maintain proper inheritance for ApplicationError', () => {
    const error = new UpdatePlanError('reason')

    expect(error instanceof Error).toBe(true)
    expect(error instanceof BaseError).toBe(true)
    expect(error instanceof ApplicationError).toBe(true)
    expect(error instanceof UpdatePlanError).toBe(true)
    expect(error instanceof DomainError).toBe(false)
    expect(error instanceof InfrastructureError).toBe(false)
  })

  it('should maintain proper inheritance for InfrastructureError', () => {
    const error = new NetworkError('url', 'reason')

    expect(error instanceof Error).toBe(true)
    expect(error instanceof BaseError).toBe(true)
    expect(error instanceof InfrastructureError).toBe(true)
    expect(error instanceof NetworkError).toBe(true)
    expect(error instanceof DomainError).toBe(false)
    expect(error instanceof ApplicationError).toBe(false)
  })
})
