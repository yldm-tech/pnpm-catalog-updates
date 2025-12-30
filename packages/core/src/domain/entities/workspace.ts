/**
 * Workspace Entity
 *
 * Represents a pnpm workspace with catalog configuration.
 * This is a core domain entity that encapsulates workspace business logic.
 */

import { CatalogNotFoundError, ValidationResultClass } from '@pcu/utils'
import type { CatalogCollection } from '../value-objects/catalogCollection.js'

/**
 * Re-export ValidationResultClass as ValidationResult for backward compatibility
 */
export { ValidationResultClass as ValidationResult }

import type { PackageCollection } from '../value-objects/packageCollection.js'
import type { WorkspaceConfig } from '../value-objects/workspaceConfig.js'
import type { WorkspaceId } from '../value-objects/workspaceId.js'
import type { WorkspacePath } from '../value-objects/workspacePath.js'

export class Workspace {
  private constructor(
    private readonly id: WorkspaceId,
    private readonly path: WorkspacePath,
    private config: WorkspaceConfig,
    private catalogs: CatalogCollection,
    private readonly packages: PackageCollection
  ) {}

  /**
   * Create a new Workspace instance
   */
  public static create(
    id: WorkspaceId,
    path: WorkspacePath,
    config: WorkspaceConfig,
    catalogs: CatalogCollection,
    packages: PackageCollection
  ): Workspace {
    return new Workspace(id, path, config, catalogs, packages)
  }

  /**
   * Get workspace identifier
   */
  public getId(): WorkspaceId {
    return this.id
  }

  /**
   * Get workspace path
   */
  public getPath(): WorkspacePath {
    return this.path
  }

  /**
   * Get workspace configuration
   */
  public getConfig(): WorkspaceConfig {
    return this.config
  }

  /**
   * Get all catalogs in this workspace
   */
  public getCatalogs(): CatalogCollection {
    return this.catalogs
  }

  /**
   * Get all packages in this workspace
   */
  public getPackages(): PackageCollection {
    return this.packages
  }

  /**
   * Check if workspace has a specific catalog
   */
  public hasCatalog(catalogName: string): boolean {
    return this.catalogs.has(catalogName)
  }

  /**
   * Get packages that use a specific catalog dependency
   */
  public getPackagesUsingCatalogDependency(
    catalogName: string,
    packageName: string
  ): PackageCollection {
    return this.packages.filterByCatalogDependency(catalogName, packageName)
  }

  /**
   * Validate workspace consistency
   * Ensures all catalog references in packages exist in catalogs
   */
  public validateConsistency(): ValidationResultClass {
    const errors: string[] = []
    const warnings: string[] = []

    // Check if all catalog references in packages exist
    for (const pkg of this.packages.getAll()) {
      const catalogRefs = pkg.getCatalogReferences()

      for (const ref of catalogRefs) {
        if (!this.catalogs.has(ref.getCatalogName())) {
          errors.push(
            `Package "${pkg.getName()}" references unknown catalog "${ref.getCatalogName()}"`
          )
        }

        const catalog = this.catalogs.get(ref.getCatalogName())
        if (catalog && !catalog.hasDependency(ref.getPackageName())) {
          warnings.push(
            `Package "${pkg.getName()}" references "${ref.getPackageName()}" ` +
              `from catalog "${ref.getCatalogName()}" but it's not defined in the catalog`
          )
        }
      }
    }

    return new ValidationResultClass(errors.length === 0, errors, warnings)
  }

  /**
   * Update a catalog dependency version
   */
  public updateCatalogDependency(
    catalogName: string,
    packageName: string,
    newVersion: string
  ): void {
    const catalog = this.catalogs.get(catalogName)
    if (!catalog) {
      throw new CatalogNotFoundError(catalogName, this.catalogs.getCatalogNames())
    }

    // Update the catalog in the collection
    catalog.updateDependencyVersion(packageName, newVersion)

    // Also update the WorkspaceConfig to ensure consistency
    this.config = this.config.updateCatalogDependency(catalogName, packageName, newVersion)
  }
}
