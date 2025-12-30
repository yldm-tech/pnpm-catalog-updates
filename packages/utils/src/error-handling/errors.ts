/**
 * Custom Error Classes
 *
 * Provides a hierarchical error system for better error handling
 * and categorization across the application layers.
 */

import * as os from 'node:os'
import * as path from 'node:path'

// ============================================================================
// Path Sanitization Utilities
// ============================================================================

/**
 * Sanitize file paths to prevent information disclosure in error messages.
 * Replaces home directory with ~ and limits path depth for security.
 */
export function sanitizePath(filePath: string): string {
  if (!filePath) return filePath

  // Replace home directory with ~
  const homeDir = os.homedir()
  let sanitized = filePath.startsWith(homeDir) ? filePath.replace(homeDir, '~') : filePath

  // If path is still absolute and long, show only last 3 segments
  if (path.isAbsolute(sanitized) && sanitized.split(path.sep).length > 4) {
    const segments = sanitized.split(path.sep)
    sanitized = `...${path.sep}${segments.slice(-3).join(path.sep)}`
  }

  return sanitized
}

/**
 * Error codes for categorization and i18n support
 */
export enum ErrorCode {
  // Domain errors (1xxx)
  WORKSPACE_NOT_FOUND = 'ERR_WORKSPACE_NOT_FOUND',
  CATALOG_NOT_FOUND = 'ERR_CATALOG_NOT_FOUND',
  PACKAGE_NOT_FOUND = 'ERR_PACKAGE_NOT_FOUND',
  INVALID_VERSION = 'ERR_INVALID_VERSION',
  INVALID_VERSION_RANGE = 'ERR_INVALID_VERSION_RANGE',
  WORKSPACE_VALIDATION_FAILED = 'ERR_WORKSPACE_VALIDATION_FAILED',

  // Application errors (2xxx)
  UPDATE_PLAN_FAILED = 'ERR_UPDATE_PLAN_FAILED',
  IMPACT_ANALYSIS_FAILED = 'ERR_IMPACT_ANALYSIS_FAILED',
  AI_ANALYSIS_FAILED = 'ERR_AI_ANALYSIS_FAILED',
  SECURITY_CHECK_FAILED = 'ERR_SECURITY_CHECK_FAILED',
  CONFIGURATION_ERROR = 'ERR_CONFIGURATION_ERROR',

  // Infrastructure errors (3xxx)
  REGISTRY_ERROR = 'ERR_REGISTRY_ERROR',
  NETWORK_ERROR = 'ERR_NETWORK_ERROR',
  FILE_SYSTEM_ERROR = 'ERR_FILE_SYSTEM_ERROR',
  FILE_SIZE_EXCEEDED = 'ERR_FILE_SIZE_EXCEEDED',
  CACHE_ERROR = 'ERR_CACHE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'ERR_EXTERNAL_SERVICE_ERROR',

  // CLI errors (4xxx)
  COMMAND_EXIT = 'ERR_COMMAND_EXIT',
}

/**
 * Base error class with code and context support
 */
export abstract class BaseError extends Error {
  public readonly code: ErrorCode
  public readonly context?: Record<string, unknown>
  public readonly timestamp: Date
  public override readonly cause?: Error

  constructor(message: string, code: ErrorCode, context?: Record<string, unknown>, cause?: Error) {
    super(message, { cause })
    this.name = this.constructor.name
    this.code = code
    this.context = context
    this.cause = cause
    this.timestamp = new Date()

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Returns a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause instanceof BaseError ? this.cause.toJSON() : this.cause?.message,
    }
  }
}

// ============================================================================
// Domain Errors - Business logic and domain rule violations
// ============================================================================

/**
 * Base class for domain-level errors
 */
export abstract class DomainError extends BaseError {}

/**
 * Thrown when a workspace cannot be found at the specified path
 */
export class WorkspaceNotFoundError extends DomainError {
  constructor(filePath: string, cause?: Error) {
    super(
      `No pnpm workspace found at "${sanitizePath(filePath)}"`,
      ErrorCode.WORKSPACE_NOT_FOUND,
      { path: filePath },
      cause
    )
  }
}

/**
 * Thrown when a catalog cannot be found in the workspace
 */
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

/**
 * Thrown when a package cannot be found in any catalog
 */
export class PackageNotFoundError extends DomainError {
  constructor(packageName: string, catalogName?: string, cause?: Error) {
    const message = catalogName
      ? `Package "${packageName}" not found in catalog "${catalogName}"`
      : `Package "${packageName}" not found in any catalog`
    super(message, ErrorCode.PACKAGE_NOT_FOUND, { packageName, catalogName }, cause)
  }
}

/**
 * Thrown when a version string is invalid
 */
export class InvalidVersionError extends DomainError {
  constructor(version: string, reason?: string, cause?: Error) {
    const message = reason
      ? `Invalid version "${version}": ${reason}`
      : `Invalid version "${version}"`
    super(message, ErrorCode.INVALID_VERSION, { version, reason }, cause)
  }
}

/**
 * Thrown when a version range is invalid
 */
export class InvalidVersionRangeError extends DomainError {
  constructor(range: string, reason?: string, cause?: Error) {
    const message = reason
      ? `Invalid version range "${range}": ${reason}`
      : `Invalid version range "${range}"`
    super(message, ErrorCode.INVALID_VERSION_RANGE, { range, reason }, cause)
  }
}

/**
 * Thrown when workspace validation fails
 */
export class WorkspaceValidationError extends DomainError {
  constructor(filePath: string, issues: string[], cause?: Error) {
    super(
      `Workspace validation failed at "${sanitizePath(filePath)}": ${issues.join('; ')}`,
      ErrorCode.WORKSPACE_VALIDATION_FAILED,
      { path: filePath, issues },
      cause
    )
  }
}

// ============================================================================
// Application Errors - Service and use case level errors
// ============================================================================

/**
 * Base class for application-level errors
 */
export abstract class ApplicationError extends BaseError {}

/**
 * Thrown when update planning fails
 */
export class UpdatePlanError extends ApplicationError {
  constructor(reason: string, context?: Record<string, unknown>, cause?: Error) {
    super(`Failed to create update plan: ${reason}`, ErrorCode.UPDATE_PLAN_FAILED, context, cause)
  }
}

/**
 * Thrown when impact analysis fails
 */
export class ImpactAnalysisError extends ApplicationError {
  constructor(packageName: string, reason: string, cause?: Error) {
    super(
      `Impact analysis failed for "${packageName}": ${reason}`,
      ErrorCode.IMPACT_ANALYSIS_FAILED,
      { packageName, reason },
      cause
    )
  }
}

/**
 * Thrown when AI analysis fails
 */
export class AIAnalysisError extends ApplicationError {
  constructor(provider: string, reason: string, cause?: Error) {
    super(
      `AI analysis failed with provider "${provider}": ${reason}`,
      ErrorCode.AI_ANALYSIS_FAILED,
      { provider, reason },
      cause
    )
  }
}

/**
 * Thrown when security check fails
 */
export class SecurityCheckError extends ApplicationError {
  constructor(packageName: string, reason: string, cause?: Error) {
    super(
      `Security check failed for "${packageName}": ${reason}`,
      ErrorCode.SECURITY_CHECK_FAILED,
      { packageName, reason },
      cause
    )
  }
}

/**
 * Thrown when configuration is invalid or missing
 */
export class ConfigurationError extends ApplicationError {
  constructor(configKey: string, reason: string, cause?: Error) {
    super(
      `Configuration error for "${configKey}": ${reason}`,
      ErrorCode.CONFIGURATION_ERROR,
      { configKey, reason },
      cause
    )
  }
}

// ============================================================================
// Infrastructure Errors - External service and system errors
// ============================================================================

/**
 * Base class for infrastructure-level errors
 */
export abstract class InfrastructureError extends BaseError {}

/**
 * Thrown when npm registry operations fail
 */
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

/**
 * Thrown when network operations fail
 */
export class NetworkError extends InfrastructureError {
  constructor(url: string, reason: string, statusCode?: number, cause?: Error) {
    super(
      `Network request failed for "${url}": ${reason}`,
      ErrorCode.NETWORK_ERROR,
      { url, reason, statusCode },
      cause
    )
  }
}

/**
 * Thrown when file system operations fail
 */
export class FileSystemError extends InfrastructureError {
  constructor(filePath: string, operation: string, reason: string, cause?: Error) {
    super(
      `File system ${operation} failed for "${sanitizePath(filePath)}": ${reason}`,
      ErrorCode.FILE_SYSTEM_ERROR,
      { path: filePath, operation, reason },
      cause
    )
  }
}

/**
 * SEC-008: Thrown when a file exceeds the maximum allowed size
 */
export class FileSizeExceededError extends InfrastructureError {
  constructor(filePath: string, actualSize: number, maxSize: number, cause?: Error) {
    const actualSizeMB = (actualSize / 1024 / 1024).toFixed(2)
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(2)
    super(
      `File "${sanitizePath(filePath)}" exceeds maximum allowed size (${actualSizeMB}MB > ${maxSizeMB}MB)`,
      ErrorCode.FILE_SIZE_EXCEEDED,
      { path: filePath, actualSize, maxSize },
      cause
    )
  }
}

/**
 * Thrown when cache operations fail
 */
export class CacheError extends InfrastructureError {
  constructor(operation: string, reason: string, cause?: Error) {
    super(
      `Cache ${operation} failed: ${reason}`,
      ErrorCode.CACHE_ERROR,
      { operation, reason },
      cause
    )
  }
}

/**
 * Thrown when external service operations fail
 */
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

// ============================================================================
// CLI Errors - Command execution and exit handling
// ============================================================================

/**
 * Thrown when a CLI command needs to exit with a specific code.
 * This replaces direct process.exit() calls for better testability and control.
 */
export class CommandExitError extends Error {
  public readonly exitCode: number
  public readonly silent: boolean

  constructor(exitCode: number, message?: string, silent = false) {
    super(message || (exitCode === 0 ? 'Command completed successfully' : 'Command failed'))
    this.name = 'CommandExitError'
    this.exitCode = exitCode
    this.silent = silent

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Create a success exit (code 0)
   */
  static success(message?: string): CommandExitError {
    return new CommandExitError(0, message, true)
  }

  /**
   * Create a failure exit (code 1)
   */
  static failure(message?: string): CommandExitError {
    return new CommandExitError(1, message)
  }

  /**
   * Create an exit with custom code
   */
  static withCode(code: number, message?: string): CommandExitError {
    return new CommandExitError(code, message)
  }
}

/**
 * Check if an error is a CommandExitError
 */
export function isCommandExitError(error: unknown): error is CommandExitError {
  return error instanceof CommandExitError
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an error is a BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError
}

/**
 * Check if an error is a DomainError
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}

/**
 * Check if an error is an ApplicationError
 */
export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError
}

/**
 * Check if an error is an InfrastructureError
 */
export function isInfrastructureError(error: unknown): error is InfrastructureError {
  return error instanceof InfrastructureError
}

/**
 * Check if an error has a specific error code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return isBaseError(error) && error.code === code
}

// ============================================================================
// Error Wrapping Utilities
// ============================================================================

/**
 * Wrap an unknown error into a BaseError
 */
export function wrapError(
  error: unknown,
  ErrorClass: new (...args: unknown[]) => BaseError,
  ...args: unknown[]
): BaseError {
  if (error instanceof BaseError) {
    return error
  }

  const cause = error instanceof Error ? error : new Error(String(error))
  return new (ErrorClass as new (...args: unknown[]) => BaseError)(...args, cause)
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * Convert unknown error to Error object
 * Use this instead of `error as Error` type assertions
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  return new Error(String(error))
}

/**
 * ERR-003: Type guard for NodeJS.ErrnoException
 * Use this instead of unsafe `as NodeJS.ErrnoException` type assertions.
 *
 * @param error - Unknown error value to check
 * @returns True if error is a NodeJS.ErrnoException with code property
 */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

/**
 * ERR-003: Safely extract error code from unknown error
 * Returns undefined if error is not an ErrnoException or has no code.
 */
export function getErrorCode(error: unknown): string | undefined {
  if (isErrnoException(error)) {
    return error.code
  }
  return undefined
}
