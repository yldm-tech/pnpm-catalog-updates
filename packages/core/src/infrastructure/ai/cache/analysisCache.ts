/**
 * AI Analysis Cache
 *
 * Provides caching for AI analysis results to avoid redundant API calls.
 * Supports TTL-based expiration and analysis type specific caching.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  AnalysisContext,
  AnalysisResult,
  AnalysisType,
} from '../../../domain/interfaces/aiProvider.js'

/**
 * Cache entry for analysis results
 */
interface AnalysisCacheEntry {
  key: string
  result: AnalysisResult
  timestamp: number
  ttl: number
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
  hits: number
  misses: number
  hitRate: number
  oldestEntry: number
  newestEntry: number
}

/**
 * AI Analysis Cache
 */
export class AnalysisCache {
  private entries = new Map<string, AnalysisCacheEntry>()
  private stats = { hits: 0, misses: 0 }
  private readonly options: Required<AnalysisCacheOptions>

  constructor(options: AnalysisCacheOptions = {}) {
    this.options = {
      ttl: options.ttl ?? 3600000, // 1 hour
      maxEntries: options.maxEntries ?? 500,
      persistToDisk: options.persistToDisk ?? true,
      cacheDir: options.cacheDir ?? join(homedir(), '.pcu', 'cache', 'ai-analysis'),
    }

    if (this.options.persistToDisk) {
      this.loadFromDisk()
    }

    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 300000)
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
    const entry = this.entries.get(key)

    if (!entry) {
      this.stats.misses++
      return undefined
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.entries.delete(key)
      this.stats.misses++
      return undefined
    }

    // Validate context hash
    const contextHash = this.generateContextHash(context)
    if (entry.contextHash !== contextHash) {
      this.entries.delete(key)
      this.stats.misses++
      return undefined
    }

    this.stats.hits++
    return entry.result
  }

  /**
   * Cache analysis result
   */
  set(context: AnalysisContext, provider: string, result: AnalysisResult, ttl?: number): void {
    const key = this.generateKey(context, provider)
    const entryTtl = ttl ?? this.getTtlForAnalysisType(context.analysisType)

    const entry: AnalysisCacheEntry = {
      key,
      result,
      timestamp: Date.now(),
      ttl: entryTtl,
      contextHash: this.generateContextHash(context),
    }

    // Ensure capacity
    this.ensureCapacity()

    this.entries.set(key, entry)

    if (this.options.persistToDisk) {
      this.saveToDisk(key, entry)
    }
  }

  /**
   * Check if result exists in cache
   */
  has(context: AnalysisContext, provider: string): boolean {
    const key = this.generateKey(context, provider)
    const entry = this.entries.get(key)

    if (!entry) {
      return false
    }

    // Check expiration
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.entries.delete(key)
      return false
    }

    return true
  }

  /**
   * Invalidate cache for specific packages
   */
  invalidateForPackages(packageNames: string[]): void {
    const packageSet = new Set(packageNames)
    const keysToDelete: string[] = []

    for (const [key, entry] of this.entries) {
      // Parse the result to check packages
      const hasPackage = entry.result.recommendations.some((r) => packageSet.has(r.package))

      if (hasPackage) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.entries.delete(key)
      if (this.options.persistToDisk) {
        this.deleteFromDisk(key)
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.entries.clear()
    this.stats.hits = 0
    this.stats.misses = 0

    if (this.options.persistToDisk) {
      this.clearDisk()
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): AnalysisCacheStats {
    const timestamps = Array.from(this.entries.values()).map((e) => e.timestamp)
    const total = this.stats.hits + this.stats.misses

    return {
      totalEntries: this.entries.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
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

  /**
   * Ensure cache doesn't exceed max entries
   */
  private ensureCapacity(): void {
    while (this.entries.size >= this.options.maxEntries) {
      this.evictOldest()
    }
  }

  /**
   * Evict oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | undefined
    let oldestTimestamp = Date.now()

    for (const [key, entry] of this.entries) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey)
      if (this.options.persistToDisk) {
        this.deleteFromDisk(oldestKey)
      }
    }
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, entry] of this.entries) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      this.entries.delete(key)
      if (this.options.persistToDisk) {
        this.deleteFromDisk(key)
      }
    }
  }

  /**
   * Load cache from disk
   */
  private loadFromDisk(): void {
    try {
      if (!existsSync(this.options.cacheDir)) {
        return
      }

      const indexPath = join(this.options.cacheDir, 'index.json')
      if (!existsSync(indexPath)) {
        return
      }

      const indexContent = readFileSync(indexPath, 'utf-8')
      const index = JSON.parse(indexContent)

      for (const key of index.keys || []) {
        try {
          const entryPath = join(this.options.cacheDir, `${key}.json`)
          if (existsSync(entryPath)) {
            const entryContent = readFileSync(entryPath, 'utf-8')
            const entry = JSON.parse(entryContent) as AnalysisCacheEntry

            // Only load if not expired
            if (Date.now() - entry.timestamp <= entry.ttl) {
              // Restore Date object
              entry.result.timestamp = new Date(entry.result.timestamp)
              this.entries.set(key, entry)
            }
          }
        } catch {
          // Skip corrupted entries
        }
      }
    } catch {
      // Ignore disk loading errors
    }
  }

  /**
   * Save entry to disk
   */
  private saveToDisk(key: string, entry: AnalysisCacheEntry): void {
    try {
      if (!existsSync(this.options.cacheDir)) {
        mkdirSync(this.options.cacheDir, { recursive: true })
      }

      const entryPath = join(this.options.cacheDir, `${key}.json`)
      writeFileSync(entryPath, JSON.stringify(entry), 'utf-8')

      this.updateDiskIndex()
    } catch {
      // Ignore disk saving errors
    }
  }

  /**
   * Delete entry from disk
   */
  private deleteFromDisk(key: string): void {
    try {
      const entryPath = join(this.options.cacheDir, `${key}.json`)
      if (existsSync(entryPath)) {
        unlinkSync(entryPath)
      }
      this.updateDiskIndex()
    } catch {
      // Ignore disk deletion errors
    }
  }

  /**
   * Clear disk cache
   */
  private clearDisk(): void {
    try {
      if (existsSync(this.options.cacheDir)) {
        const fs = require('node:fs')
        fs.rmSync(this.options.cacheDir, { recursive: true, force: true })
      }
    } catch {
      // Ignore disk clearing errors
    }
  }

  /**
   * Update disk index
   */
  private updateDiskIndex(): void {
    try {
      const indexPath = join(this.options.cacheDir, 'index.json')
      const index = {
        keys: Array.from(this.entries.keys()),
        lastUpdated: Date.now(),
      }
      writeFileSync(indexPath, JSON.stringify(index), 'utf-8')
    } catch {
      // Ignore index update errors
    }
  }
}

// Export singleton instance
export const analysisCache = new AnalysisCache()
