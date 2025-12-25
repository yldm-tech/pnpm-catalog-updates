// Core domain and application exports for pnpm-catalog-updates

// Application Interfaces
export type {
  ProgressReporter,
  ProgressReporterOptions,
} from './application/interfaces/progressReporter'
export type {
  AIAnalysisServiceOptions,
  AnalysisRequestOptions,
  MultiAnalysisResult,
} from './application/services/aiAnalysisService'
// Application Services
export { AIAnalysisService } from './application/services/aiAnalysisService'
// Backup Service
export type { BackupInfo, BackupServiceOptions } from './application/services/backupService'
export { BackupService } from './application/services/backupService'
// Application Service Types
export type {
  CatalogUpdateInfo,
  CheckOptions,
  ImpactAnalysis,
  OutdatedDependencyInfo,
  OutdatedReport,
  UpdateOptions,
  UpdatePlan,
  UpdateResult,
  UpdateTarget,
} from './application/services/catalogUpdateService'
export { CatalogUpdateService } from './application/services/catalogUpdateService'
// Impact Analysis Service
export type { PackageImpact, SecurityImpact } from './application/services/impactAnalysisService'
export { ImpactAnalysisService } from './application/services/impactAnalysisService'
// Watch Service
export type { WatchCallbacks, WatchOptions } from './application/services/watchService'
export { WatchService } from './application/services/watchService'
export type {
  WorkspaceStats,
  WorkspaceValidationReport,
} from './application/services/workspaceService'
export { WorkspaceService } from './application/services/workspaceService'
// Domain Entities
export { Catalog } from './domain/entities/catalog'
export { Package } from './domain/entities/package'
export { Workspace } from './domain/entities/workspace'
// AI Domain Interfaces
export type {
  AIConfig,
  AIProvider,
  AIProviderConfig,
  AIProviderInfo,
  AnalysisContext,
  AnalysisResult,
  AnalysisType,
  PackageUpdateInfo,
  Recommendation,
  RiskLevel,
  WorkspaceInfo,
} from './domain/interfaces/aiProvider'
// Repository Interface
export type { WorkspaceRepository } from './domain/repositories/workspaceRepository'
// Value Objects
export { CatalogCollection } from './domain/value-objects/catalogCollection'
export { PackageCollection } from './domain/value-objects/packageCollection'
export { Version } from './domain/value-objects/version'
export { WorkspaceConfig } from './domain/value-objects/workspaceConfig'
export { WorkspaceId } from './domain/value-objects/workspaceId'
export { WorkspacePath } from './domain/value-objects/workspacePath'
export type {
  AnalysisCacheOptions,
  AnalysisCacheStats,
  BaseProviderOptions,
  ClaudeProviderOptions,
  CodexProviderOptions,
  GeminiProviderOptions,
} from './infrastructure/ai/index'
// AI Infrastructure
export {
  AIDetector,
  AnalysisCache,
  analysisCache,
  BaseAIProvider,
  ClaudeProvider,
  CodexProvider,
  GeminiProvider,
  RuleEngine,
} from './infrastructure/ai/index'
// Infrastructure - Cache
export type { CacheStats } from './infrastructure/cache/cache'
export {
  Cache,
  RegistryCache,
  registryCache,
  WorkspaceCache,
  workspaceCache,
} from './infrastructure/cache/cache'
// Changelog Service
export type {
  ChangelogEntry,
  PackageChangelog,
} from './infrastructure/external-services/changelogService'
export { ChangelogService } from './infrastructure/external-services/changelogService'
export { NpmRegistryService } from './infrastructure/external-services/npmRegistryService'
// Security Advisory Types
export type {
  SecurityAdvisoryReport,
  VulnerabilityInfo,
} from './infrastructure/external-services/securityAdvisoryService'
export { SecurityAdvisoryService } from './infrastructure/external-services/securityAdvisoryService'
export { FileSystemService } from './infrastructure/file-system/fileSystemService'
export { FileWorkspaceRepository } from './infrastructure/repositories/fileWorkspaceRepository'
export { NpmrcParser } from './infrastructure/utils/npmrcParser'
