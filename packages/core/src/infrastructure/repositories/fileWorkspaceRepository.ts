/**
 * File-based Workspace Repository Implementation
 *
 * Implements WorkspaceRepository interface using the file system.
 * Handles loading and saving workspace data from pnpm-workspace.yaml and package.json files.
 */

import path from 'node:path'

import { FileSystemError, getErrorCode, logger, WorkspaceNotFoundError } from '@pcu/utils'
import { Catalog } from '../../domain/entities/catalog.js'
import { Package } from '../../domain/entities/package.js'
import { Workspace } from '../../domain/entities/workspace.js'
import type { WorkspaceRepository } from '../../domain/repositories/workspaceRepository.js'
import { CatalogCollection } from '../../domain/value-objects/catalogCollection.js'
import { PackageCollection } from '../../domain/value-objects/packageCollection.js'
import { WorkspaceConfig } from '../../domain/value-objects/workspaceConfig.js'
import { WorkspaceId } from '../../domain/value-objects/workspaceId.js'
import { WorkspacePath } from '../../domain/value-objects/workspacePath.js'
import type { FileSystemService } from '../file-system/fileSystemService.js'

export class FileWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly fileSystemService: FileSystemService) {}

  /**
   * Find a workspace by its path
   */
  async findByPath(path: WorkspacePath): Promise<Workspace | null> {
    try {
      // Check if the path contains a valid workspace
      if (!(await this.isValidWorkspace(path))) {
        return null
      }

      // Load workspace configuration
      const config = await this.loadConfiguration(path)

      // Create workspace ID from path
      const id = WorkspaceId.fromPath(path.toString())

      // Load packages
      const packages = await this.loadPackages(path, config)

      // Load catalogs
      const catalogs = await this.loadCatalogs(config)

      return Workspace.create(id, path, config, catalogs, packages)
    } catch (error) {
      logger.error(
        `Failed to load workspace from ${path.toString()}`,
        error instanceof Error ? error : undefined
      )
      return null
    }
  }

  /**
   * Get a workspace by its path
   * Throws WorkspaceNotFoundError if not found
   */
  async getByPath(path: WorkspacePath): Promise<Workspace> {
    const workspace = await this.findByPath(path)
    if (!workspace) {
      throw new WorkspaceNotFoundError(path.toString())
    }
    return workspace
  }

  /**
   * Find a workspace by its ID
   */
  async findById(_id: WorkspaceId): Promise<Workspace | null> {
    // For file-based implementation, we would need to maintain a mapping
    // of IDs to paths. For now, this is not implemented.
    throw new FileSystemError(
      'unknown',
      'findById',
      'Finding workspace by ID is not implemented in file-based repository'
    )
  }

  /**
   * Save a workspace with atomic transaction support.
   * Implements atomic save to prevent inconsistent state.
   * If any save operation fails, all changes are rolled back.
   */
  async save(workspace: Workspace): Promise<void> {
    const backups: Map<string, string> = new Map()
    const workspacePath = workspace.getPath()

    try {
      // Phase 1: Create backups of all files that will be modified
      await this.createSaveBackups(workspace, backups)

      // Phase 2: Attempt to save all files
      await this.saveConfiguration(workspacePath, workspace.getConfig())
      await this.savePackagesAtomic(workspace.getPackages())

      // Phase 3: Success - clean up backups
      await this.cleanupBackups(backups)
    } catch (error) {
      // Phase 4: Failure - rollback all changes
      logger.warn('Save operation failed, rolling back changes', {
        workspacePath: workspacePath.toString(),
        error: error instanceof Error ? error.message : String(error),
      })

      await this.rollbackFromBackups(backups)

      throw new FileSystemError(
        workspacePath.toString(),
        'save',
        `Atomic save failed and changes were rolled back: ${error}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Create backups of all files that will be modified during save.
   * Only ignores ENOENT errors (file doesn't exist = new file).
   * Other errors (EACCES, ENOSPC, etc.) should fail the save operation.
   */
  private async createSaveBackups(
    workspace: Workspace,
    backups: Map<string, string>
  ): Promise<void> {
    const workspacePath = workspace.getPath()

    // Backup pnpm-workspace.yaml
    const workspaceConfigPath = workspacePath.getPnpmWorkspaceConfigPath().toString()
    try {
      const backupPath = await this.fileSystemService.createBackup(workspaceConfigPath)
      backups.set(workspaceConfigPath, backupPath)
    } catch (error) {
      // Only ignore ENOENT (file not found) - this means it's a new file
      if (this.isFileNotFoundError(error)) {
        logger.debug('No existing workspace config to backup (new workspace)', {
          path: workspaceConfigPath,
        })
      } else {
        // Re-throw other errors (permissions, disk full, etc.)
        throw error
      }
    }

    // Backup all package.json files
    for (const pkg of workspace.getPackages().getAll()) {
      const packageJsonPath = pkg.getPath().getPackageJsonPath().toString()
      try {
        const backupPath = await this.fileSystemService.createBackup(packageJsonPath)
        backups.set(packageJsonPath, backupPath)
      } catch (error) {
        // Only ignore ENOENT (file not found) - this means it's a new file
        if (this.isFileNotFoundError(error)) {
          logger.debug('No existing package.json to backup (new package)', {
            path: packageJsonPath,
          })
        } else {
          // Re-throw other errors (permissions, disk full, etc.)
          throw error
        }
      }
    }
  }

  /**
   * Check if an error is a "file not found" error (ENOENT)
   * ERR-003: Use type-safe error code extraction
   */
  private isFileNotFoundError(error: unknown): boolean {
    return getErrorCode(error) === 'ENOENT'
  }

  /**
   * Save packages atomically - all or nothing
   * Unlike savePackages, this method throws on first error instead of continuing
   */
  private async savePackagesAtomic(packages: PackageCollection): Promise<void> {
    for (const pkg of packages.getAll()) {
      const packageData = pkg.toPackageJsonData()
      await this.fileSystemService.writePackageJson(pkg.getPath(), packageData)
    }
  }

  /**
   * Rollback all changes from backups
   */
  private async rollbackFromBackups(backups: Map<string, string>): Promise<void> {
    for (const [originalPath, backupPath] of backups) {
      try {
        await this.fileSystemService.restoreFromBackup(originalPath, backupPath)
        logger.debug('Restored file from backup', { originalPath, backupPath })
      } catch (restoreError) {
        // Log but continue with other rollbacks
        logger.error(
          `Failed to restore file from backup: ${originalPath} <- ${backupPath}`,
          restoreError instanceof Error ? restoreError : undefined
        )
      }
    }

    // Clean up backups after rollback attempt
    await this.cleanupBackups(backups)
  }

  /**
   * Clean up backup files
   */
  private async cleanupBackups(backups: Map<string, string>): Promise<void> {
    for (const [, backupPath] of backups) {
      try {
        await this.fileSystemService.removeFile(backupPath)
      } catch (error) {
        // Ignore cleanup errors - backups can be cleaned up later
        logger.debug('Failed to cleanup backup file', {
          backupPath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    backups.clear()
  }

  /**
   * Load workspace configuration from path
   */
  async loadConfiguration(path: WorkspacePath): Promise<WorkspaceConfig> {
    try {
      const workspaceData = await this.fileSystemService.readPnpmWorkspaceConfig(path)
      return WorkspaceConfig.fromWorkspaceData(workspaceData)
    } catch (error) {
      throw new FileSystemError(
        path.toString(),
        'loadConfig',
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Save workspace configuration to path
   */
  async saveConfiguration(path: WorkspacePath, config: WorkspaceConfig): Promise<void> {
    try {
      const workspaceData = config.toPnpmWorkspaceData()
      await this.fileSystemService.writePnpmWorkspaceConfig(path, workspaceData)
    } catch (error) {
      throw new FileSystemError(
        path.toString(),
        'saveConfig',
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Check if a path contains a valid pnpm workspace
   */
  async isValidWorkspace(path: WorkspacePath): Promise<boolean> {
    return await this.fileSystemService.isPnpmWorkspace(path.toString())
  }

  /**
   * Discover workspace from current working directory or given path
   */
  async discoverWorkspace(searchPath?: WorkspacePath): Promise<Workspace | null> {
    const startPath = searchPath?.toString() || process.cwd()

    try {
      const workspacePath = await this.fileSystemService.findNearestWorkspace(startPath)

      if (!workspacePath) {
        return null
      }

      return await this.findByPath(WorkspacePath.fromString(workspacePath))
    } catch (error) {
      logger.error(
        `Failed to discover workspace from ${startPath}`,
        error instanceof Error ? error : undefined
      )
      return null
    }
  }

  /**
   * Load packages from workspace.
   * Enhanced error handling with better context and statistics.
   */
  private async loadPackages(
    workspacePath: WorkspacePath,
    config: WorkspaceConfig
  ): Promise<PackageCollection> {
    try {
      const packagePatterns = config.getPackagePatterns()

      // Find all package.json files matching the patterns
      const packageJsonFiles = await this.fileSystemService.findPackageJsonFiles(
        workspacePath,
        packagePatterns
      )

      // Load packages in parallel for better performance in large monorepos.
      // Use Promise.allSettled for cleaner error handling and statistics.
      const packageLoadPromises = packageJsonFiles.map(async (packageJsonPath) => {
        const packageDir = path.dirname(packageJsonPath)
        const packagePath = WorkspacePath.fromString(packageDir)

        // Read package.json
        const packageData = await this.fileSystemService.readPackageJson(packagePath)

        // Create package
        const packageId = `${packageData.name}-${packageDir}`
        return {
          pkg: Package.create(packageId, packageData.name, packagePath, packageData),
          path: packageJsonPath,
        }
      })

      const results = await Promise.allSettled(packageLoadPromises)

      // Collect successful packages and track failures with context
      const packages: Package[] = []
      const failures: Array<{ path: string; reason: string; errorType: string }> = []

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const packageJsonPath = packageJsonFiles[i]

        if (result?.status === 'fulfilled') {
          packages.push(result.value.pkg)
        } else if (result?.status === 'rejected') {
          const error = result.reason as Error
          // Categorize error type for better diagnostics
          const errorType = this.categorizePackageLoadError(error)
          failures.push({
            path: packageJsonPath ?? 'unknown',
            reason: error?.message ?? 'Unknown error',
            errorType,
          })
        }
      }

      // Log summary of failures with categorization
      if (failures.length > 0) {
        const byType = failures.reduce(
          (acc, f) => {
            acc[f.errorType] = (acc[f.errorType] || 0) + 1
            return acc
          },
          {} as Record<string, number>
        )

        logger.warn(`Failed to load ${failures.length} of ${packageJsonFiles.length} packages`, {
          workspacePath: workspacePath.toString(),
          failuresByType: byType,
          failures: failures.slice(0, 5), // Limit to first 5 for brevity
        })
      }

      return PackageCollection.fromPackages(packages)
    } catch (error) {
      throw new FileSystemError(
        workspacePath.toString(),
        'loadPackages',
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Categorize package load errors for better diagnostics.
   * ERR-003: Use type-safe error code extraction
   */
  private categorizePackageLoadError(error: Error): string {
    const message = error.message?.toLowerCase() ?? ''
    const code = getErrorCode(error)

    if (code === 'ENOENT' || message.includes('no such file')) {
      return 'file_not_found'
    }
    if (code === 'EACCES' || code === 'EPERM' || message.includes('permission')) {
      return 'permission_denied'
    }
    if (message.includes('json') || message.includes('parse') || message.includes('syntax')) {
      return 'invalid_json'
    }
    if (code === 'EBUSY' || code === 'ENOTEMPTY') {
      return 'file_locked'
    }
    return 'unknown'
  }

  /**
   * Load catalogs from workspace configuration
   */
  private async loadCatalogs(config: WorkspaceConfig): Promise<CatalogCollection> {
    try {
      const catalogs: Catalog[] = []
      const catalogDefinitions = config.getCatalogDefinitions()

      for (const [catalogName, catalogDef] of catalogDefinitions) {
        const catalogId = `catalog-${catalogName}`
        const catalog = Catalog.create(
          catalogId,
          catalogName,
          catalogDef.getDependencies(),
          config.getCatalogMode()
        )
        catalogs.push(catalog)
      }

      return CatalogCollection.fromCatalogs(catalogs)
    } catch (error) {
      throw new FileSystemError(
        'workspace',
        'loadCatalogs',
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      )
    }
  }
}
