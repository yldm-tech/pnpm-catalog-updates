/**
 * Workspace Service
 *
 * Application service for workspace discovery, validation, and management.
 * Provides high-level operations for working with pnpm workspaces.
 */

import { WorkspaceNotFoundError, WorkspaceValidationError } from '@pcu/utils'
import type { Workspace } from '../../domain/entities/workspace.js'
import type { WorkspaceRepository } from '../../domain/repositories/workspaceRepository.js'
import { WorkspacePath } from '../../domain/value-objects/workspacePath.js'

export interface WorkspaceInfo {
  path: string
  name: string
  isValid: boolean
  hasPackages: boolean
  hasCatalogs: boolean
  packageCount: number
  catalogCount: number
  catalogNames: string[]
}

export interface WorkspaceValidationReport {
  isValid: boolean
  workspace: WorkspaceInfo
  errors: string[]
  warnings: string[]
  recommendations: string[]
}

export interface CatalogInfo {
  name: string
  packageCount: number
  packages: string[]
  mode: string
}

export interface PackageInfo {
  name: string
  path: string
  hasPackageJson: boolean
  catalogReferences: CatalogReferenceInfo[]
  dependencies: DependencyInfo[]
}

export interface CatalogReferenceInfo {
  catalogName: string
  packageName: string
  dependencyType: string
}

export interface DependencyInfo {
  name: string
  version: string
  type: string
  isCatalogReference: boolean
}

/**
 * MAGIC-001: Health score calculation constants
 * Extracted from calculateHealthScore to improve maintainability
 */
const HEALTH_SCORE = {
  BASE: 100,
  MIN: 0,
  MAX: 100,
  PENALTIES: {
    PER_ERROR: 20,
    PER_WARNING: 5,
    NO_WORKSPACE: 30,
    NO_PACKAGES: 20,
    NO_CATALOGS: 10,
  },
  BONUSES: {
    HAS_CATALOG_REFS: 5,
  },
  THRESHOLDS: {
    EXCELLENT: 90,
    GOOD: 70,
    FAIR: 50,
  },
} as const

export class WorkspaceService {
  constructor(private readonly workspaceRepository: WorkspaceRepository) {}

  /**
   * DUP-001: Helper method to convert a Package entity to PackageInfo DTO.
   * Extracted from getPackages and getPackagesUsingCatalog to eliminate duplication.
   *
   * @param pkg - The package entity to convert
   * @param catalogFilter - Optional catalog name to filter references by
   * @returns PackageInfo DTO with all package information
   */
  private packageToInfo(
    pkg: ReturnType<ReturnType<Workspace['getPackages']>['getAll']>[0],
    catalogFilter?: string
  ): PackageInfo {
    const catalogReferences = catalogFilter
      ? pkg.getCatalogReferences().filter((ref) => ref.getCatalogName() === catalogFilter)
      : pkg.getCatalogReferences()

    const dependencies = pkg.getDependencies()
    const allDependencies: DependencyInfo[] = []
    const depTypes = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ] as const

    for (const depType of depTypes) {
      const deps = dependencies.getDependenciesByType(depType)
      for (const [name, version] of deps) {
        allDependencies.push({
          name,
          version,
          type: depType,
          isCatalogReference: version.startsWith('catalog:'),
        })
      }
    }

    return {
      name: pkg.getName(),
      path: pkg.getPath().toString(),
      hasPackageJson: true, // If package was loaded, it has package.json
      catalogReferences: catalogReferences.map((ref) => ({
        catalogName: ref.getCatalogName(),
        packageName: ref.getPackageName(),
        dependencyType: ref.getDependencyType(),
      })),
      dependencies: allDependencies,
    }
  }

  /**
   * Discover workspace from current directory or specified path
   */
  async discoverWorkspace(searchPath?: string): Promise<Workspace> {
    const path = searchPath ? WorkspacePath.fromString(searchPath) : undefined

    const workspace = await this.workspaceRepository.discoverWorkspace(path)

    if (!workspace) {
      throw new WorkspaceNotFoundError(searchPath || process.cwd())
    }

    return workspace
  }

  /**
   * Get workspace information
   */
  async getWorkspaceInfo(workspacePath?: string): Promise<WorkspaceInfo> {
    const path = WorkspacePath.fromString(workspacePath || process.cwd())

    // Try to load workspace
    const workspace = await this.workspaceRepository.findByPath(path)

    if (!workspace) {
      return {
        path: path.toString(),
        name: path.getDirectoryName(),
        isValid: false,
        hasPackages: false,
        hasCatalogs: false,
        packageCount: 0,
        catalogCount: 0,
        catalogNames: [],
      }
    }

    const packages = workspace.getPackages()
    const catalogs = workspace.getCatalogs()

    return {
      path: path.toString(),
      name: path.getDirectoryName(),
      isValid: true,
      hasPackages: !packages.isEmpty(),
      hasCatalogs: !catalogs.isEmpty(),
      packageCount: packages.size(),
      catalogCount: catalogs.size(),
      catalogNames: catalogs.getCatalogNames(),
    }
  }

  /**
   * Validate workspace integrity and configuration
   */
  async validateWorkspace(workspacePath?: string): Promise<WorkspaceValidationReport> {
    const path = WorkspacePath.fromString(workspacePath || process.cwd())
    const workspaceInfo = await this.getWorkspaceInfo(workspacePath)

    if (!workspaceInfo.isValid) {
      return {
        isValid: false,
        workspace: workspaceInfo,
        errors: ['Not a valid pnpm workspace'],
        warnings: [],
        recommendations: [
          'Initialize a pnpm workspace with: pnpm init',
          'Create pnpm-workspace.yaml file',
          'Define package patterns in pnpm-workspace.yaml',
        ],
      }
    }

    // Load workspace for detailed validation
    const workspace = await this.workspaceRepository.findByPath(path)
    if (!workspace) {
      throw new WorkspaceValidationError(path.toString(), ['Workspace not found at specified path'])
    }

    // Validate workspace consistency
    const validationResult = workspace.validateConsistency()
    const recommendations: string[] = []

    // Generate recommendations based on workspace state
    if (!workspaceInfo.hasCatalogs) {
      recommendations.push('Consider using catalogs to centralize dependency management')
    }

    if (workspaceInfo.packageCount === 0) {
      recommendations.push('No packages found - check your package patterns in pnpm-workspace.yaml')
    }

    if (workspaceInfo.packageCount > 20) {
      recommendations.push(
        'Large workspace detected - consider organizing packages into logical groups'
      )
    }

    // Validate catalogs
    const catalogValidation = workspace.getCatalogs().validate()
    const allErrors = [...validationResult.getErrors(), ...catalogValidation.getErrors()]
    const allWarnings = [...validationResult.getWarnings(), ...catalogValidation.getWarnings()]

    return {
      isValid: validationResult.getIsValid() && catalogValidation.getIsValid(),
      workspace: workspaceInfo,
      errors: allErrors,
      warnings: allWarnings,
      recommendations,
    }
  }

  /**
   * Get detailed catalog information
   */
  async getCatalogs(workspacePath?: string): Promise<CatalogInfo[]> {
    const workspace = await this.discoverWorkspace(workspacePath)
    const catalogs = workspace.getCatalogs()

    return catalogs.getAll().map((catalog) => ({
      name: catalog.getName(),
      packageCount: catalog.getPackageNames().length,
      packages: catalog.getPackageNames(),
      mode: catalog.getMode(),
    }))
  }

  /**
   * Get detailed package information
   */
  async getPackages(workspacePath?: string): Promise<PackageInfo[]> {
    const workspace = await this.discoverWorkspace(workspacePath)
    const packages = workspace.getPackages()

    // DUP-001: Use packageToInfo helper to eliminate duplication
    return packages.getAll().map((pkg) => this.packageToInfo(pkg))
  }

  /**
   * Check if workspace uses catalogs
   */
  async usesCatalogs(workspacePath?: string): Promise<boolean> {
    try {
      const workspace = await this.discoverWorkspace(workspacePath)
      return !workspace.getCatalogs().isEmpty()
    } catch {
      return false
    }
  }

  /**
   * Get packages that use a specific catalog
   */
  async getPackagesUsingCatalog(
    catalogName: string,
    workspacePath?: string
  ): Promise<PackageInfo[]> {
    const workspace = await this.discoverWorkspace(workspacePath)
    const packagesUsingCatalog = workspace.getPackages().findPackagesUsingCatalog(catalogName)

    // DUP-001: Use packageToInfo helper with catalog filter to eliminate duplication
    return packagesUsingCatalog.map((pkg) => this.packageToInfo(pkg, catalogName))
  }

  /**
   * Get workspace statistics
   */
  async getWorkspaceStats(workspacePath?: string): Promise<WorkspaceStats> {
    const workspace = await this.discoverWorkspace(workspacePath)
    const packages = workspace.getPackages()
    const catalogs = workspace.getCatalogs()

    // Count dependencies
    let totalDependencies = 0
    let catalogDependencies = 0
    const dependencyTypes = {
      dependencies: 0,
      devDependencies: 0,
      peerDependencies: 0,
      optionalDependencies: 0,
    }

    for (const pkg of packages.getAll()) {
      const deps = pkg.getDependencies()
      const catalogRefs = pkg.getCatalogReferences()

      catalogDependencies += catalogRefs.length

      for (const depType of Object.keys(dependencyTypes) as Array<keyof typeof dependencyTypes>) {
        const typeDeps = deps.getDependenciesByType(depType)
        dependencyTypes[depType] += typeDeps.size
        totalDependencies += typeDeps.size
      }
    }

    // Count catalog definitions
    let totalCatalogEntries = 0
    for (const catalog of catalogs.getAll()) {
      totalCatalogEntries += catalog.getPackageNames().length
    }

    return {
      workspace: {
        path: workspace.getPath().toString(),
        name: workspace.getPath().getDirectoryName(),
      },
      packages: {
        total: packages.size(),
        withCatalogReferences: packages.findPackagesWithCatalogReferences().length,
      },
      catalogs: {
        total: catalogs.size(),
        totalEntries: totalCatalogEntries,
      },
      dependencies: {
        total: totalDependencies,
        catalogReferences: catalogDependencies,
        byType: dependencyTypes,
      },
    }
  }

  /**
   * Find workspaces in a directory tree
   */
  async findWorkspaces(searchRoot: string): Promise<WorkspaceInfo[]> {
    // This would implement a recursive search for pnpm workspaces
    // For now, we'll just check the provided directory
    const workspaceInfo = await this.getWorkspaceInfo(searchRoot)
    return workspaceInfo.isValid ? [workspaceInfo] : []
  }

  /**
   * Check workspace health
   */
  async checkHealth(workspacePath?: string): Promise<WorkspaceHealthReport> {
    const validation = await this.validateWorkspace(workspacePath)
    const stats = await this.getWorkspaceStats(workspacePath)

    const issues: HealthIssue[] = []
    const score = this.calculateHealthScore(validation, stats, issues)

    return {
      score,
      status: this.getHealthStatus(score),
      validation,
      stats,
      issues,
      lastChecked: new Date(),
    }
  }

  /**
   * Calculate workspace health score (0-100)
   * MAGIC-001: Uses HEALTH_SCORE constants for maintainability
   */
  private calculateHealthScore(
    validation: WorkspaceValidationReport,
    stats: WorkspaceStats,
    issues: HealthIssue[]
  ): number {
    let score = HEALTH_SCORE.BASE

    // Deduct points for errors
    score -= validation.errors.length * HEALTH_SCORE.PENALTIES.PER_ERROR

    // Deduct points for warnings
    score -= validation.warnings.length * HEALTH_SCORE.PENALTIES.PER_WARNING

    // Deduct points for workspace issues
    if (!stats.workspace) {
      score -= HEALTH_SCORE.PENALTIES.NO_WORKSPACE
    }

    if (stats.packages.total === 0) {
      score -= HEALTH_SCORE.PENALTIES.NO_PACKAGES
      issues.push({
        type: 'warning',
        message: 'No packages found in workspace',
        suggestion: 'Check package patterns in pnpm-workspace.yaml',
      })
    }

    if (stats.catalogs.total === 0) {
      score -= HEALTH_SCORE.PENALTIES.NO_CATALOGS
      issues.push({
        type: 'info',
        message: 'No catalogs defined',
        suggestion: 'Consider using catalogs for better dependency management',
      })
    }

    // Bonus for good practices
    if (stats.dependencies.catalogReferences > 0) {
      score += HEALTH_SCORE.BONUSES.HAS_CATALOG_REFS
    }

    return Math.max(HEALTH_SCORE.MIN, Math.min(HEALTH_SCORE.MAX, score))
  }

  /**
   * Get health status from score
   * MAGIC-001: Uses HEALTH_SCORE.THRESHOLDS constants
   */
  private getHealthStatus(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (score >= HEALTH_SCORE.THRESHOLDS.EXCELLENT) return 'excellent'
    if (score >= HEALTH_SCORE.THRESHOLDS.GOOD) return 'good'
    if (score >= HEALTH_SCORE.THRESHOLDS.FAIR) return 'fair'
    return 'poor'
  }
}

export interface WorkspaceStats {
  workspace: {
    path: string
    name: string
  }
  packages: {
    total: number
    withCatalogReferences: number
  }
  catalogs: {
    total: number
    totalEntries: number
  }
  dependencies: {
    total: number
    catalogReferences: number
    byType: {
      dependencies: number
      devDependencies: number
      peerDependencies: number
      optionalDependencies: number
    }
  }
}

export interface HealthIssue {
  type: 'error' | 'warning' | 'info'
  message: string
  suggestion: string
}

export interface WorkspaceHealthReport {
  score: number
  status: 'excellent' | 'good' | 'fair' | 'poor'
  validation: WorkspaceValidationReport
  stats: WorkspaceStats
  issues: HealthIssue[]
  lastChecked: Date
}
