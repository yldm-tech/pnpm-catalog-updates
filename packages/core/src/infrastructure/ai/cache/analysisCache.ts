/**
 * AI Analysis Cache
 *
 * Refactored to use composition with Cache class to eliminate code duplication.
 * Provides caching for AI analysis results to avoid redundant API calls.
 * Supports TTL-based expiration and analysis type specific caching.
 */

import { createHash } from 'node:crypto'

import type {
  AnalysisContext,
  AnalysisResult,
  AnalysisType,
} from '../../../domain/interfaces/aiProvider.js'
import { Cache } from '../../cache/cache.js'

/**
 * Cache entry for analysis results
 */
interface AnalysisCacheEntry {
  result: AnalysisResult
  contextHash: string
}

/**
 * Cache options
 */
export interface AnalysisCacheOptions {
  ttl?: number // TTL in milliseconds (default: 1 hour)
  maxEntries?: number // Max cached entries
  persistToDisk?: boolean // Persist cache to disk
  cacheDir?: string // Custom cache directory
}

/**
 * Cache statistics
 */
export interface AnalysisCacheStats {
  totalEntries: number
  totalSize: number
  hits: number
  misses: number
  hitRate: number
  missRate: number
  oldestEntry: number
  newestEntry: number
}

/**
 * AI Analysis Cache
 *
 * Uses Cache class internally via composition to avoid code duplication.
 * Adds analysis-specific functionality on top of the base cache.
 */
export class AnalysisCache {
  // Internal Cache instance handles storage, TTL, disk persistence, cleanup
  private readonly cache: Cache<AnalysisCacheEntry>
  private readonly options: {
    ttl: number
    maxEntries: number
    persistToDisk: boolean
    cacheDir?: string
  }

  // Track additional statistics not provided by base cache
  private entryTimestamps = new Map<string, number>()

  constructor(options: AnalysisCacheOptions = {}) {
    this.options = {
      ttl: options.ttl ?? 3600000, // 1 hour
      maxEntries: options.maxEntries ?? 500,
      persistToDisk: options.persistToDisk ?? true,
      cacheDir: options.cacheDir ?? undefined,
    }

    // Delegate to Cache class for core functionality
    this.cache = new Cache<AnalysisCacheEntry>('ai-analysis', {
      ttl: this.options.ttl,
      maxEntries: this.options.maxEntries,
      persistToDisk: this.options.persistToDisk,
      cacheDir: this.options.cacheDir,
    })
  }

  /**
   * Async initialization for disk-based cache
   */
  async initialize(): Promise<void> {
    await this.cache.initialize()
  }

  /**
   * Generate cache key from analysis context
   */
  private generateKey(context: AnalysisContext, provider: string): string {
    const keyData = {
      provider,
      analysisType: context.analysisType,
      packages: context.packages
        .map((p) => `${p.name}@${p.currentVersion}->${p.targetVersion}`)
        .sort(),
      workspace: context.workspaceInfo.name,
    }

    return createHash('md5').update(JSON.stringify(keyData)).digest('hex')
  }

  /**
   * Generate context hash for validation
   */
  private generateContextHash(context: AnalysisContext): string {
    return createHash('sha256').update(JSON.stringify(context)).digest('hex')
  }

  /**
   * Get cached analysis result
   */
  get(context: AnalysisContext, provider: string): AnalysisResult | undefined {
    const key = this.generateKey(context, provider)
    const entry = this.cache.get(key)

    if (!entry) {
      return undefined
    }

    // Validate context hash
    const contextHash = this.generateContextHash(context)
    if (entry.contextHash !== contextHash) {
      this.cache.delete(key)
      this.entryTimestamps.delete(key)
      return undefined
    }

    return entry.result
  }

  /**
   * Cache analysis result
   */
  set(context: AnalysisContext, provider: string, result: AnalysisResult, ttl?: number): void {
    const key = this.generateKey(context, provider)
    const entryTtl = ttl ?? this.getTtlForAnalysisType(context.analysisType)

    const entry: AnalysisCacheEntry = {
      result,
      contextHash: this.generateContextHash(context),
    }

    this.cache.set(key, entry, entryTtl)
    this.entryTimestamps.set(key, Date.now())
  }

  /**
   * Check if result exists in cache
   */
  has(context: AnalysisContext, provider: string): boolean {
    return this.get(context, provider) !== undefined
  }

  /**
   * Invalidate cache for specific packages
   */
  invalidateForPackages(packageNames: string[]): void {
    const packageSet = new Set(packageNames)

    // We need to iterate through the timestamps map to find matching entries
    // This is less efficient than before, but avoids code duplication
    for (const key of this.entryTimestamps.keys()) {
      const entry = this.cache.get(key)
      if (entry) {
        const hasPackage = entry.result.recommendations.some((r) => packageSet.has(r.package))
        if (hasPackage) {
          this.cache.delete(key)
          this.entryTimestamps.delete(key)
        }
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.entryTimestamps.clear()
  }

  /**
   * Get cache statistics
   */
  getStats(): AnalysisCacheStats {
    const baseStats = this.cache.getStats()
    const timestamps = Array.from(this.entryTimestamps.values())

    return {
      totalEntries: baseStats.totalEntries,
      totalSize: baseStats.totalSize,
      hits: baseStats.hits,
      misses: baseStats.misses,
      hitRate: baseStats.hitRate,
      missRate: baseStats.missRate,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
    }
  }

  /**
   * Get TTL based on analysis type
   */
  private getTtlForAnalysisType(type: AnalysisType): number {
    switch (type) {
      case 'security':
        return 1800000 // 30 minutes for security (more time-sensitive)
      case 'impact':
        return 3600000 // 1 hour for impact analysis
      case 'compatibility':
        return 7200000 // 2 hours for compatibility
      case 'recommend':
        return 3600000 // 1 hour for recommendations
      default:
        return this.options.ttl
    }
  }
}

// Export singleton instance
export const analysisCache = new AnalysisCache()
