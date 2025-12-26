/**
 * Domain Layer Exports
 *
 * ARCH-001: Barrel file for domain layer to reduce God Object pattern.
 * Contains domain entities, value objects, interfaces, and repository contracts.
 */

// Domain Entities
export { Catalog } from './entities/catalog.js'
export { Package } from './entities/package.js'
export { Workspace } from './entities/workspace.js'

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
} from './interfaces/aiProvider.js'

// Repository Interface
export type { WorkspaceRepository } from './repositories/workspaceRepository.js'

// Value Objects
export { CatalogCollection } from './value-objects/catalogCollection.js'
export { PackageCollection } from './value-objects/packageCollection.js'
export { Version } from './value-objects/version.js'
export { WorkspaceConfig } from './value-objects/workspaceConfig.js'
export { WorkspaceId } from './value-objects/workspaceId.js'
export { WorkspacePath } from './value-objects/workspacePath.js'
