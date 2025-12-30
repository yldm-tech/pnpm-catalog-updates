/**
 * Error Handling Module
 *
 * Provides centralized error handling for user-friendly error messages,
 * error tracking/statistics, and custom error classes.
 */

// Error Renderer (UI layer for error messages)
export type { ErrorInfo, OutputWriter, SkippedPackagesSummary } from './errorRenderer.js'
export { ErrorRenderer } from './errorRenderer.js'
// Custom Error Classes
export {
  AIAnalysisError,
  ApplicationError,
  // Base classes
  BaseError,
  CacheError,
  CatalogNotFoundError,
  // CLI exit handling
  CommandExitError,
  ConfigurationError,
  DomainError,
  // Enums
  ErrorCode,
  ExternalServiceError,
  FileSizeExceededError,
  FileSystemError,
  // ERR-003: Error utilities
  getErrorCode,
  getErrorMessage,
  hasErrorCode,
  ImpactAnalysisError,
  InfrastructureError,
  InvalidVersionError,
  InvalidVersionRangeError,
  isApplicationError,
  // Type guards
  isBaseError,
  isCommandExitError,
  isDomainError,
  isErrnoException,
  isInfrastructureError,
  NetworkError,
  PackageNotFoundError,
  // Infrastructure errors
  RegistryError,
  SecurityCheckError,
  toError,
  // Application errors
  UpdatePlanError,
  // Domain errors
  WorkspaceNotFoundError,
  WorkspaceValidationError,
  // Utilities
  wrapError,
} from './errors.js'
// Error Tracker
export type { SkippedPackage } from './errorTracker.js'
export { ErrorTracker } from './errorTracker.js'

// User-friendly Error Handler
export type { ErrorContext, PackageSuggestion } from './userFriendlyErrorHandler.js'
export { preloadPackageSuggestions, UserFriendlyErrorHandler } from './userFriendlyErrorHandler.js'
