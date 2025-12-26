/**
 * Statistics Utilities
 *
 * Common utilities for calculating update statistics.
 * Extracted to reduce code duplication.
 */

/**
 * Update type counts for statistics display
 */
export interface UpdateTypeCounts {
  major: number
  minor: number
  patch: number
}

/**
 * Item with updateType property
 */
interface HasUpdateType {
  updateType: 'major' | 'minor' | 'patch'
}

/**
 * Count updates by type from an array of items with updateType property
 *
 * @param items - Array of items with updateType (PlannedUpdate, OutdatedDependencyInfo, etc.)
 * @returns Object with counts for each update type
 */
export function countUpdateTypes<T extends HasUpdateType>(items: T[]): UpdateTypeCounts {
  const counts: UpdateTypeCounts = { major: 0, minor: 0, patch: 0 }

  for (const item of items) {
    counts[item.updateType]++
  }

  return counts
}

/**
 * Count updates from an OutdatedReport structure (nested catalogs)
 *
 * @param catalogs - Array of catalog objects with outdatedDependencies
 * @returns Object with counts for each update type
 */
export function countUpdateTypesFromCatalogs<T extends { outdatedDependencies: HasUpdateType[] }>(
  catalogs: T[]
): UpdateTypeCounts {
  const counts: UpdateTypeCounts = { major: 0, minor: 0, patch: 0 }

  for (const catalog of catalogs) {
    for (const dep of catalog.outdatedDependencies) {
      counts[dep.updateType]++
    }
  }

  return counts
}
