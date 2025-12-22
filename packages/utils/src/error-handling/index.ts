/**
 * Error Handling Module
 *
 * Provides centralized error handling for user-friendly error messages,
 * error tracking/statistics, and custom error classes.
 */

// Custom Error Classes
export {
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
} from './errors.js'

// Error Tracker
export type { SkippedPackage } from './errorTracker.js'
export { ErrorTracker } from './errorTracker.js'

// User-friendly Error Handler
export type { ErrorContext, PackageSuggestion } from './userFriendlyErrorHandler.js'
export { UserFriendlyErrorHandler } from './userFriendlyErrorHandler.js'
