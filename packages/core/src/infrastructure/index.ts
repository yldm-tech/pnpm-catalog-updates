/**
 * Infrastructure Layer Exports
 *
 * ARCH-001: Barrel file for infrastructure layer to reduce God Object pattern.
 * Contains concrete implementations of domain interfaces.
 *
 * NOTE: These are exported for convenience but should be used
 * through dependency injection when possible. Prefer using the
 * abstract interfaces (AIProvider, WorkspaceRepository) in
 * application code for better testability.
 */

// AI Infrastructure - Types and Implementations
export type {
  AnalysisCacheOptions,
  AnalysisCacheStats,
  BaseProviderOptions,
  ClaudeProviderOptions,
  CodexProviderOptions,
  GeminiProviderOptions,
} from './ai/index.js'
export {
  AIDetector,
  AnalysisCache,
  analysisCache,
  BaseAIProvider,
  ClaudeProvider,
  CodexProvider,
  GeminiProvider,
  RuleEngine,
} from './ai/index.js'

// Cache Infrastructure - Types and Implementations
export type { CacheStats } from './cache/cache.js'
export {
  Cache,
  // Async cache initialization functions
  initializeCaches,
  RegistryCache,
  registryCache,
  startCacheInitialization,
  WorkspaceCache,
  workspaceCache,
} from './cache/cache.js'

// External Services - Changelog
export type {
  ChangelogEntry,
  PackageChangelog,
} from './external-services/changelogService.js'
export { ChangelogService } from './external-services/changelogService.js'

// External Services - NPM Registry
export type {
  BatchQueryFailure,
  BatchQueryResult,
} from './external-services/npmRegistryService.js'
export { NpmRegistryService } from './external-services/npmRegistryService.js'

// External Services - Package Manager
export type {
  IPackageManagerService,
  PackageManagerOptions,
  PackageManagerResult,
} from './external-services/packageManagerService.js'
export { PnpmPackageManagerService } from './external-services/packageManagerService.js'

// External Services - Security Advisory
export type {
  SecurityAdvisoryReport,
  VulnerabilityInfo,
} from './external-services/securityAdvisoryService.js'
export { SecurityAdvisoryService } from './external-services/securityAdvisoryService.js'

// File System Infrastructure
export { FileSystemService } from './file-system/fileSystemService.js'

// Repository Infrastructure (implements WorkspaceRepository interface)
export { FileWorkspaceRepository } from './repositories/fileWorkspaceRepository.js'

// Utility Infrastructure
export { NpmrcParser } from './utils/npmrcParser.js'
