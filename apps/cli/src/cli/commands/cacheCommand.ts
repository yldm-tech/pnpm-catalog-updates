/**
 * Cache Command
 *
 * CLI command to manage PCU cache for NPM registry responses and workspace data.
 * Supports viewing cache statistics and clearing cache entries.
 */

import type { CacheStats } from '@pcu/core'
import { analysisCache, registryCache, workspaceCache } from '@pcu/core'
import { CommandExitError, logger, t } from '@pcu/utils'
import { StyledText, ThemeManager } from '../themes/colorTheme.js'

export interface CacheCommandOptions {
  stats?: boolean
  clear?: boolean
  verbose?: boolean
  color?: boolean
}

interface CacheInfo {
  name: string
  stats: CacheStats
  description: string
}

export class CacheCommand {
  /**
   * Execute the cache command
   */
  async execute(options: CacheCommandOptions = {}): Promise<void> {
    try {
      // Initialize theme
      ThemeManager.setTheme('default')

      // Default to showing stats if no option specified
      if (!options.clear && !options.stats) {
        options.stats = true
      }

      if (options.clear) {
        await this.clearCache(options)
      }

      if (options.stats) {
        this.showStats(options)
      }

      throw CommandExitError.success()
    } catch (error) {
      // Re-throw CommandExitError as-is
      if (error instanceof CommandExitError) {
        throw error
      }

      logger.error('Cache command failed', error instanceof Error ? error : undefined, { options })
      console.error(StyledText.iconError('Error managing cache:'))
      console.error(StyledText.error(String(error)))

      if (options.verbose && error instanceof Error) {
        console.error(StyledText.muted('Stack trace:'))
        console.error(StyledText.muted(error.stack || 'No stack trace available'))
      }

      throw CommandExitError.failure('Cache command failed')
    }
  }

  /**
   * Clear all caches
   */
  private async clearCache(options: CacheCommandOptions): Promise<void> {
    if (options.verbose) {
      console.log(StyledText.iconInfo('Clearing caches...'))
      console.log('')
    }

    // Clear registry cache (NPM API responses)
    registryCache.clear()
    if (options.verbose) {
      console.log(StyledText.muted('  ✓ Registry cache cleared'))
    }

    // Clear workspace cache (file system data)
    workspaceCache.clear()
    if (options.verbose) {
      console.log(StyledText.muted('  ✓ Workspace cache cleared'))
    }

    // Clear AI analysis cache
    analysisCache.clear()
    if (options.verbose) {
      console.log(StyledText.muted('  ✓ AI analysis cache cleared'))
    }

    console.log('')
    console.log(StyledText.iconSuccess(t('success.cacheCleared')))
  }

  /**
   * Show cache statistics
   */
  private showStats(options: CacheCommandOptions): void {
    const caches: CacheInfo[] = [
      {
        name: 'Registry Cache',
        stats: registryCache.getStats(),
        description: 'NPM registry API responses (package info, versions)',
      },
      {
        name: 'Workspace Cache',
        stats: workspaceCache.getStats(),
        description: 'Workspace file system data (package.json files)',
      },
      {
        name: 'AI Analysis Cache',
        stats: analysisCache.getStats(),
        description: 'AI-powered dependency analysis results',
      },
    ]

    console.log(StyledText.iconInfo('Cache Statistics'))
    console.log('')

    for (const cache of caches) {
      this.printCacheStats(cache, options)
    }

    // Print summary
    const totalEntries = caches.reduce((sum, c) => sum + c.stats.totalEntries, 0)
    const totalSize = caches.reduce((sum, c) => sum + c.stats.totalSize, 0)
    const totalHits = caches.reduce((sum, c) => sum + c.stats.hits, 0)
    const totalMisses = caches.reduce((sum, c) => sum + c.stats.misses, 0)
    const overallHitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0

    console.log(StyledText.muted('─'.repeat(50)))
    console.log(StyledText.bold('Summary'))
    console.log(StyledText.muted(`  Total entries: ${totalEntries}`))
    console.log(StyledText.muted(`  Total size: ${this.formatBytes(totalSize)}`))
    console.log(StyledText.muted(`  Overall hit rate: ${(overallHitRate * 100).toFixed(1)}%`))
    console.log('')
  }

  /**
   * Print statistics for a single cache
   */
  private printCacheStats(cache: CacheInfo, options: CacheCommandOptions): void {
    const { stats } = cache

    console.log(StyledText.bold(`📦 ${cache.name}`))
    if (options.verbose) {
      console.log(StyledText.muted(`   ${cache.description}`))
    }
    console.log(StyledText.muted(`   Entries: ${stats.totalEntries}`))
    console.log(StyledText.muted(`   Size: ${this.formatBytes(stats.totalSize)}`))
    console.log(StyledText.muted(`   Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`))

    if (options.verbose) {
      console.log(StyledText.muted(`   Hits: ${stats.hits}, Misses: ${stats.misses}`))
    }
    console.log('')
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB']
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / k ** i).toFixed(1)} ${units[i]}`
  }

  /**
   * Validate command options
   */
  static validateOptions(_options: CacheCommandOptions): string[] {
    const errors: string[] = []
    // No validation needed for cache options
    return errors
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Manage PCU cache

Usage:
  pcu cache [options]

Options:
  --stats                Show cache statistics (default)
  --clear                Clear all cache entries
  --verbose              Show detailed information
  --no-color             Disable colored output

Description:
  PCU uses caching to improve performance:
  - Registry Cache: Stores NPM registry API responses
  - Workspace Cache: Stores workspace file system data
  - AI Analysis Cache: Stores AI-powered analysis results

  Cache entries expire automatically based on TTL settings.
  Use --clear to force clear all caches if you experience
  stale data issues.

Examples:
  pcu cache                    # Show cache statistics
  pcu cache --stats            # Show cache statistics
  pcu cache --clear            # Clear all caches
  pcu cache --clear --verbose  # Clear caches with detailed output

Exit Codes:
  0  Command completed successfully
  1  Error occurred
    `
  }
}
