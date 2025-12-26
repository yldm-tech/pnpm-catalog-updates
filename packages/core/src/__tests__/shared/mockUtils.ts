/**
 * Shared Mock Utilities for @pcu/utils
 *
 * This module provides reusable mock factories and configurable mock controls
 * to eliminate boilerplate duplication across test files.
 *
 * Usage in test files:
 * ```typescript
 * import { mockControls, createPcuUtilsMock } from '../../__tests__/shared/mockUtils.js'
 *
 * // Use vi.hoisted() to get configurable mocks
 * const mocks = vi.hoisted(() => mockControls())
 *
 * // Use the shared mock factory
 * vi.mock('@pcu/utils', () => createPcuUtilsMock(mocks))
 * ```
 */

import { type Mock, vi } from 'vitest'

// Type alias for mock functions to avoid vitest spy type inference issues
type MockFn = Mock

// Error code enum matching @pcu/utils
export const ErrorCode = {
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CATALOG_NOT_FOUND: 'CATALOG_NOT_FOUND',
  PACKAGE_NOT_FOUND: 'PACKAGE_NOT_FOUND',
  INVALID_VERSION: 'INVALID_VERSION',
  INVALID_VERSION_RANGE: 'INVALID_VERSION_RANGE',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKSPACE_VALIDATION_ERROR: 'WORKSPACE_VALIDATION_ERROR',
  FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR',
  REGISTRY_ERROR: 'REGISTRY_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  AI_ANALYSIS_ERROR: 'AI_ANALYSIS_ERROR',
} as const

// Base error class
export class BaseError extends Error {
  code: string
  context: Record<string, unknown>
  override cause?: Error
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.context = context
    this.cause = cause
  }
}

// Domain errors
export class DomainError extends BaseError {}
export class InfrastructureError extends BaseError {}
export class ApplicationError extends BaseError {}

export class CatalogNotFoundError extends DomainError {
  constructor(catalogName: string, availableCatalogs?: string[], cause?: Error) {
    super(
      `Catalog "${catalogName}" not found${availableCatalogs?.length ? `. Available catalogs: ${availableCatalogs.join(', ')}` : ''}`,
      ErrorCode.CATALOG_NOT_FOUND,
      { catalogName, availableCatalogs },
      cause
    )
  }
}

export class PackageNotFoundError extends DomainError {
  constructor(packageName: string, cause?: Error) {
    super(`Package "${packageName}" not found`, ErrorCode.PACKAGE_NOT_FOUND, { packageName }, cause)
  }
}

export class InvalidVersionError extends DomainError {
  constructor(version: string, reason: string, cause?: Error) {
    super(
      `Invalid version "${version}": ${reason}`,
      ErrorCode.INVALID_VERSION,
      { version, reason },
      cause
    )
  }
}

export class InvalidVersionRangeError extends DomainError {
  constructor(range: string, reason: string, cause?: Error) {
    super(
      `Invalid version range "${range}": ${reason}`,
      ErrorCode.INVALID_VERSION_RANGE,
      { range, reason },
      cause
    )
  }
}

export class WorkspaceNotFoundError extends DomainError {
  constructor(path: string, cause?: Error) {
    super(`No pnpm workspace found at "${path}"`, ErrorCode.WORKSPACE_NOT_FOUND, { path }, cause)
  }
}

export class WorkspaceValidationError extends DomainError {
  constructor(path: string, reason: string, cause?: Error) {
    super(
      `Workspace validation failed at "${path}": ${reason}`,
      ErrorCode.WORKSPACE_VALIDATION_ERROR,
      { path, reason },
      cause
    )
  }
}

// Infrastructure errors
export class FileSystemError extends InfrastructureError {
  constructor(path: string, operation: string, reason: string, cause?: Error) {
    super(
      `File system ${operation} failed for "${path}": ${reason}`,
      ErrorCode.FILE_SYSTEM_ERROR,
      { path, operation, reason },
      cause
    )
  }
}

export class RegistryError extends InfrastructureError {
  constructor(
    packageName: string,
    operation: string,
    reason: string,
    statusCode?: number,
    cause?: Error
  ) {
    super(
      `Registry ${operation} failed for "${packageName}": ${reason}`,
      ErrorCode.REGISTRY_ERROR,
      { packageName, operation, reason, statusCode },
      cause
    )
  }
}

export class ExternalServiceError extends InfrastructureError {
  constructor(serviceName: string, operation: string, reason: string, cause?: Error) {
    super(
      `External service "${serviceName}" ${operation} failed: ${reason}`,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      { serviceName, operation, reason },
      cause
    )
  }
}

export class NetworkError extends InfrastructureError {
  constructor(url: string, reason: string, statusCode?: number, cause?: Error) {
    super(`Network request failed for "${url}": ${reason}`, ErrorCode.NETWORK_ERROR, {
      url,
      reason,
      statusCode,
    })
    this.cause = cause
  }
}

// Application errors
export class AIAnalysisError extends ApplicationError {
  constructor(provider: string, analysisType: string, reason: string, cause?: Error) {
    super(
      `AI analysis failed with ${provider} for ${analysisType}: ${reason}`,
      ErrorCode.AI_ANALYSIS_ERROR,
      { provider, analysisType, reason },
      cause
    )
  }
}

/**
 * Mock logger interface
 */
export interface MockLogger {
  debug: MockFn
  info: MockFn
  warn: MockFn
  error: MockFn
  fatal: MockFn
  setLevel: MockFn
  child: MockFn
}

/**
 * Create a mock logger instance
 */
export function createMockLogger(): MockLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    setLevel: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }
}

/**
 * Interface for configurable mock controls
 */
export interface MockControls {
  getPackageConfig: ReturnType<typeof vi.fn>
  loadConfig: ReturnType<typeof vi.fn>
  loadConfigAsync: ReturnType<typeof vi.fn>
  handleSecurityCheckFailure: ReturnType<typeof vi.fn>
  handlePackageQueryFailure: ReturnType<typeof vi.fn>
  handleRetryAttempt: ReturnType<typeof vi.fn>
  formatError: ReturnType<typeof vi.fn>
  parallelLimit: ReturnType<typeof vi.fn>
}

/**
 * Create mock controls that can be configured in individual tests
 * Use with vi.hoisted() to ensure proper hoisting
 */
export function mockControls(): MockControls {
  return {
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
  }
}

/**
 * Create the complete @pcu/utils mock with configurable controls
 */
export function createPcuUtilsMock(controls?: MockControls): Record<string, unknown> {
  const logger = createMockLogger()
  const mocks = controls ?? mockControls()

  return {
    // Error codes
    ErrorCode,

    // Base classes
    BaseError,
    DomainError,
    InfrastructureError,
    ApplicationError,

    // Domain errors
    CatalogNotFoundError,
    PackageNotFoundError,
    InvalidVersionError,
    InvalidVersionRangeError,
    WorkspaceNotFoundError,
    WorkspaceValidationError,

    // Infrastructure errors
    FileSystemError,
    RegistryError,
    ExternalServiceError,
    NetworkError,

    // Application errors
    AIAnalysisError,

    // Logger mocks
    logger,
    createLogger: vi.fn(() => logger),
    Logger: {
      getLogger: vi.fn(() => logger),
      resetAllLoggers: vi.fn(),
      instances: new Map(),
    },

    // User-friendly error handler
    UserFriendlyErrorHandler: {
      handleSecurityCheckFailure: mocks.handleSecurityCheckFailure,
      handlePackageQueryFailure: mocks.handlePackageQueryFailure,
      handleRetryAttempt: mocks.handleRetryAttempt,
      formatError: mocks.formatError,
    },

    // Config loader
    ConfigLoader: {
      loadConfig: mocks.loadConfigAsync,
      loadConfigSync: mocks.loadConfig,
      getPackageConfig: mocks.getPackageConfig,
    },

    // Config mock
    getConfig: vi.fn(() => ({
      getConfig: vi.fn(() => ({ logLevel: 'info' })),
    })),
    ConfigManager: vi.fn(),

    // Parallel limit for concurrent operations
    parallelLimit: mocks.parallelLimit,
  }
}

/**
 * Default mock return values for common test scenarios
 */
export const defaultMockReturns = {
  packageConfig: {
    shouldUpdate: true,
    requireConfirmation: false,
    autoUpdate: true,
    groupUpdate: false,
  },
  config: {
    advanced: {},
    monorepo: {},
    security: { notifyOnSecurityUpdate: false },
  },
  asyncConfig: {
    include: [],
    exclude: [],
    defaults: {},
    advanced: {
      concurrency: 8,
    },
    security: {
      enableAudit: true,
      notifyOnSecurityUpdate: false,
    },
  },
}

/**
 * Setup default mock return values for common scenarios
 */
export function setupDefaultMockReturns(mocks: MockControls): void {
  mocks.getPackageConfig.mockReturnValue(defaultMockReturns.packageConfig)
  mocks.loadConfig.mockReturnValue(defaultMockReturns.config)
  mocks.loadConfigAsync.mockResolvedValue(defaultMockReturns.asyncConfig)
}

// ============================================================
// Mock Entity Factories
// ============================================================

/**
 * Create a mock Catalog entity
 */
export function createMockCatalog(
  name: string,
  dependencies: Map<string, string> = new Map([
    ['lodash', '^4.17.20'],
    ['typescript', '^5.0.0'],
  ])
): Record<string, MockFn> {
  return {
    getName: vi.fn().mockReturnValue(name),
    getDependencies: vi.fn().mockReturnValue(dependencies),
    hasDependency: vi.fn((pkg: string) => dependencies.has(pkg)),
    getDependencyVersion: vi.fn((pkg: string) => dependencies.get(pkg)),
    setDependency: vi.fn(),
    removeDependency: vi.fn(),
    getPackageNames: vi.fn().mockReturnValue(Array.from(dependencies.keys())),
    getMode: vi.fn().mockReturnValue('strict'),
  }
}

/**
 * Create a mock CatalogCollection
 */
export function createMockCatalogCollection(
  catalogs: Record<string, MockFn>[] = []
): Record<string, MockFn> {
  const catalogMap = new Map(catalogs.map((c) => [(c.getName as MockFn)(), c]))
  const defaultCatalog = catalogs[0] ?? createMockCatalog('default')

  return {
    get: vi.fn(
      (name: string) => catalogMap.get(name) ?? (name === 'default' ? defaultCatalog : undefined)
    ),
    getAll: vi.fn().mockReturnValue(catalogs.length > 0 ? catalogs : [defaultCatalog]),
    has: vi.fn((name: string) => catalogMap.has(name) || name === 'default'),
    size: vi.fn().mockReturnValue(catalogs.length || 1),
    isEmpty: vi.fn().mockReturnValue(false),
    getCatalogNames: vi
      .fn()
      .mockReturnValue(
        catalogs.length > 0 ? catalogs.map((c) => (c.getName as MockFn)()) : ['default']
      ),
    validate: vi.fn().mockReturnValue({
      getIsValid: () => true,
      getErrors: () => [],
      getWarnings: () => [],
    }),
  }
}

/**
 * Create a mock Package entity
 */
export function createMockPackage(
  name: string,
  catalogRefs: Array<{ catalogName: string; packageName: string; dependencyType: string }> = []
): Record<string, MockFn> {
  return {
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
    toPackageJsonData: vi.fn().mockReturnValue({
      name,
      version: '1.0.0',
    }),
  }
}

/**
 * Create a mock PackageCollection
 */
export function createMockPackageCollection(
  packages: Record<string, MockFn>[] = []
): Record<string, MockFn> {
  return {
    getAll: vi.fn().mockReturnValue(packages),
    size: vi.fn().mockReturnValue(packages.length),
    isEmpty: vi.fn().mockReturnValue(packages.length === 0),
    getPackageNames: vi.fn().mockReturnValue(packages.map((p) => (p.getName as MockFn)())),
    findPackagesWithCatalogReferences: vi.fn().mockReturnValue(packages),
    findPackagesUsingCatalog: vi.fn().mockReturnValue(packages),
  }
}

/**
 * Create a mock Workspace entity
 */
export function createMockWorkspace(
  path = '/test/workspace',
  name = 'test-workspace',
  catalogCollection?: Record<string, MockFn>,
  packageCollection?: Record<string, MockFn>
): Record<string, MockFn> {
  const catalogs = catalogCollection ?? createMockCatalogCollection()
  const packages = packageCollection ?? createMockPackageCollection()

  return {
    getId: vi.fn().mockReturnValue({ value: `workspace-${name}` }),
    getPath: vi.fn().mockReturnValue({
      toString: () => path,
      getDirectoryName: () => name,
    }),
    getName: vi.fn().mockReturnValue(name),
    getCatalogs: vi.fn().mockReturnValue(catalogs),
    getPackages: vi.fn().mockReturnValue(packages),
    getPackagesUsingCatalogDependency: vi.fn().mockReturnValue({
      getPackageNames: () => [],
      getAll: () => [],
    }),
    updateCatalogDependency: vi.fn(),
    validateConsistency: vi.fn().mockReturnValue({
      getIsValid: () => true,
      getErrors: () => [],
      getWarnings: () => [],
    }),
  }
}

// ============================================================
// Mock Repository Factories
// ============================================================

/**
 * Create a mock WorkspaceRepository
 */
export function createMockWorkspaceRepository(
  mockWorkspace?: Record<string, MockFn>
): Record<string, MockFn> {
  const workspace = mockWorkspace ?? createMockWorkspace()

  return {
    findByPath: vi.fn().mockResolvedValue(workspace),
    getByPath: vi.fn().mockResolvedValue(workspace),
    findById: vi.fn().mockResolvedValue(workspace),
    save: vi.fn().mockResolvedValue(undefined),
    loadConfiguration: vi.fn().mockResolvedValue({}),
    saveConfiguration: vi.fn().mockResolvedValue(undefined),
    isValidWorkspace: vi.fn().mockResolvedValue(true),
    discoverWorkspace: vi.fn().mockResolvedValue(workspace),
  }
}

/**
 * Create a mock NpmRegistryService
 */
export function createMockRegistryService(
  versionMap: Record<string, string> = {
    lodash: '4.17.21',
    typescript: '5.3.0',
    react: '18.2.0',
  }
): Record<string, MockFn> {
  return {
    getLatestVersion: vi.fn().mockImplementation(async (packageName: string) => {
      return versionMap[packageName] || '1.0.0'
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
    getPackageVersions: vi.fn().mockResolvedValue({
      name: 'test-package',
      versions: ['1.0.0', '1.1.0', '2.0.0'],
      latestVersion: '2.0.0',
      tags: { latest: '2.0.0' },
    }),
    getGreatestVersion: vi.fn().mockResolvedValue({ toString: () => '2.0.0' }),
    getNewestVersions: vi.fn().mockResolvedValue([{ toString: () => '2.0.0' }]),
    batchQueryVersions: vi.fn().mockResolvedValue(new Map()),
    hasPackageAuthorChanged: vi.fn().mockResolvedValue(false),
    getDownloadStats: vi.fn().mockResolvedValue(10000),
    clearCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0,
      hits: 0,
      misses: 0,
    }),
  }
}
