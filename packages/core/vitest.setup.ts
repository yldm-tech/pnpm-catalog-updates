/**
 * Vitest Setup File
 *
 * This file runs before all tests to ensure proper mocking of @pcu/utils
 * to avoid ConfigManager initialization issues during logger instantiation.
 */

import { vi } from 'vitest'

// Define error code enum to match original
const ErrorCode = {
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
}

// Base error class
class BaseError extends Error {
  code: string
  context: Record<string, unknown>
  cause?: Error
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.context = context
    this.cause = cause
  }
}

// Domain errors
class DomainError extends BaseError {}
class InfrastructureError extends BaseError {}
class ApplicationError extends BaseError {}

class CatalogNotFoundError extends DomainError {
  constructor(catalogName: string, cause?: Error) {
    super(`Catalog "${catalogName}" not found`, ErrorCode.CATALOG_NOT_FOUND, { catalogName }, cause)
  }
}

class PackageNotFoundError extends DomainError {
  constructor(packageName: string, cause?: Error) {
    super(`Package "${packageName}" not found`, ErrorCode.PACKAGE_NOT_FOUND, { packageName }, cause)
  }
}

class InvalidVersionError extends DomainError {
  constructor(version: string, reason: string, cause?: Error) {
    super(
      `Invalid version "${version}": ${reason}`,
      ErrorCode.INVALID_VERSION,
      { version, reason },
      cause
    )
  }
}

class InvalidVersionRangeError extends DomainError {
  constructor(range: string, reason: string, cause?: Error) {
    super(
      `Invalid version range "${range}": ${reason}`,
      ErrorCode.INVALID_VERSION_RANGE,
      { range, reason },
      cause
    )
  }
}

class WorkspaceNotFoundError extends DomainError {
  constructor(path: string, cause?: Error) {
    super(`Workspace not found at "${path}"`, ErrorCode.WORKSPACE_NOT_FOUND, { path }, cause)
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

// Infrastructure errors
class FileSystemError extends InfrastructureError {
  constructor(path: string, operation: string, reason: string, cause?: Error) {
    super(
      `File system ${operation} failed for "${path}": ${reason}`,
      ErrorCode.FILE_SYSTEM_ERROR,
      { path, operation, reason },
      cause
    )
  }
}

class RegistryError extends InfrastructureError {
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

class ExternalServiceError extends InfrastructureError {
  constructor(serviceName: string, operation: string, reason: string, cause?: Error) {
    super(
      `External service "${serviceName}" ${operation} failed: ${reason}`,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      { serviceName, operation, reason },
      cause
    )
  }
}

class NetworkError extends InfrastructureError {
  constructor(url: string, reason: string, statusCode?: number, cause?: Error) {
    super(
      `Network request failed for "${url}": ${reason}`,
      ErrorCode.NETWORK_ERROR,
      { url, reason, statusCode },
      cause
    )
  }
}

// Application errors
class AIAnalysisError extends ApplicationError {
  constructor(provider: string, analysisType: string, reason: string, cause?: Error) {
    super(
      `AI analysis failed with ${provider} for ${analysisType}: ${reason}`,
      ErrorCode.AI_ANALYSIS_ERROR,
      { provider, analysisType, reason },
      cause
    )
  }
}

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  setLevel: vi.fn(),
  child: vi.fn().mockReturnThis(),
}

// Mock the entire @pcu/utils module
vi.mock('@pcu/utils', () => ({
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
  logger: mockLogger,
  createLogger: vi.fn(() => mockLogger),
  Logger: {
    getLogger: vi.fn(() => mockLogger),
    resetAllLoggers: vi.fn(),
    instances: new Map(),
  },

  // Other commonly used exports
  UserFriendlyErrorHandler: {
    handleRetryAttempt: vi.fn(),
    handleSecurityCheckFailure: vi.fn(),
    handlePackageQueryFailure: vi.fn(),
    formatError: vi.fn((e: Error) => e.message),
  },

  // Config mock
  getConfig: vi.fn(() => ({
    getConfig: vi.fn(() => ({ logLevel: 'info' })),
  })),
  ConfigManager: vi.fn(),
}))
