/**
 * Cache System
 *
 * Provides caching capabilities for NPM registry responses and other expensive operations.
 * Supports both in-memory and file-based caching with TTL and size limits.
 */

import { createHash } from 'node:crypto'
import { promises as fsPromises } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface CacheEntry<T = unknown> {
  key: string
  value: T
  timestamp: number
  ttl: number // Time to live in milliseconds
  size: number // Estimated size in bytes
}

export interface CacheOptions {
  ttl?: number // Default TTL in milliseconds
  maxSize?: number // Max total cache size in bytes
  maxEntries?: number // Max number of entries
  persistToDisk?: boolean // Whether to persist cache to disk
  cacheDir?: string // Directory for file-based cache
}

export interface CacheStats {
  totalEntries: number
  totalSize: number
  hitRate: number
  missRate: number
  hits: number
  misses: number
}

export class Cache<T = unknown> {
  private entries = new Map<string, CacheEntry<T>>()
  private stats = {
    hits: 0,
    misses: 0,
  }

  // Track total size incrementally for O(1) access
  private _totalSize = 0

  // Index entries by expiration time for efficient cleanup
  // Sorted array of [expirationTime, key] tuples
  private expirationIndex: Array<[number, string]> = []

  private options: Required<CacheOptions>

  // Track initialization state for async loading
  private _initialized = false
  private _initPromise: Promise<void> | null = null

  // RES-001: Store cleanup interval reference for proper resource management
  private cleanupIntervalId: NodeJS.Timeout | null = null
  private _destroyed = false

  constructor(name: string, options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl || 3600000, // 1 hour default
      maxSize: options.maxSize || 50 * 1024 * 1024, // 50MB default
      maxEntries: options.maxEntries || 1000,
      persistToDisk: options.persistToDisk || false,
      cacheDir: options.cacheDir || join(homedir(), '.pcu', 'cache', name),
    }

    // Defer disk loading to async initialization
    // Don't block constructor with synchronous I/O

    // Setup cleanup interval with unref() to allow process exit
    // RES-001: Store reference for proper cleanup
    this.cleanupIntervalId = setInterval(() => this.cleanup(), 300000) // Clean every 5 minutes
    this.cleanupIntervalId.unref()
  }

  /**
   * RES-001: Destroy the cache and release all resources
   * Call this when the cache is no longer needed to prevent memory leaks
   */
  destroy(): void {
    if (this._destroyed) {
      return
    }
    this._destroyed = true

    // Clear the cleanup interval
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = null
    }

    // Clear all entries and tracking structures
    this.entries.clear()
    this._totalSize = 0
    this.expirationIndex = []
    this.stats.hits = 0
    this.stats.misses = 0
    this._initPromise = null
  }

  /**
   * RES-001: Check if the cache has been destroyed
   */
  get destroyed(): boolean {
    return this._destroyed
  }

  /**
   * Async initialization for disk-based caches.
   * Call this before using cache if persistToDisk is enabled.
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return
    }

    if (this._initPromise) {
      return this._initPromise
    }

    this._initPromise = this.loadFromDiskAsync()
    await this._initPromise
    this._initialized = true
  }

  /**
   * Check if cache is initialized
   */
  get initialized(): boolean {
    return this._initialized || !this.options.persistToDisk
  }

  /**
   * RES-001: Check if cache is destroyed and throw if so
   */
  private ensureNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error('Cache has been destroyed and cannot be used')
    }
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    this.ensureNotDestroyed()
    const entry = this.entries.get(key)

    if (!entry) {
      this.stats.misses++
      return undefined
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.entries.delete(key)
      this.stats.misses++
      return undefined
    }

    this.stats.hits++
    return entry.value
  }

  /**
   * Set value in cache.
   * Maintains incremental size tracking and expiration index.
   */
  set(key: string, value: T, ttl?: number): void {
    this.ensureNotDestroyed()
    const entryTtl = ttl || this.options.ttl
    const size = this.estimateSize(value)
    const timestamp = Date.now()
    const expirationTime = timestamp + entryTtl

    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp,
      ttl: entryTtl,
      size,
    }

    // Remove old entry if exists (updates _totalSize)
    if (this.entries.has(key)) {
      const oldEntry = this.entries.get(key)!
      this._totalSize -= oldEntry.size
      this.entries.delete(key)
      // Note: old expiration index entry will be cleaned up lazily during cleanup
    }

    // Check size limits before adding
    this.ensureCapacity(size)

    this.entries.set(key, entry)

    // Update incremental tracking
    this._totalSize += size
    this.addToExpirationIndex(expirationTime, key)

    if (this.options.persistToDisk) {
      this.saveToDisk(key, entry)
    }
  }

  /**
   * Add entry to expiration index using binary insertion to maintain sorted order
   */
  private addToExpirationIndex(expirationTime: number, key: string): void {
    // Binary search for insertion point to maintain sorted order
    let low = 0
    let high = this.expirationIndex.length

    while (low < high) {
      const mid = (low + high) >>> 1
      if (this.expirationIndex[mid]![0] < expirationTime) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    this.expirationIndex.splice(low, 0, [expirationTime, key])
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.entries.get(key)

    if (!entry) {
      return false
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.entries.delete(key)
      return false
    }

    return true
  }

  /**
   * Delete entry from cache. Updates incremental size tracking.
   */
  delete(key: string): boolean {
    const entry = this.entries.get(key)
    if (!entry) {
      return false
    }

    // Update size tracking before deletion
    this._totalSize -= entry.size
    const deleted = this.entries.delete(key)

    if (deleted && this.options.persistToDisk) {
      this.deleteFromDisk(key)
    }

    return deleted
  }

  /**
   * Clear all cache entries. Resets all tracking structures.
   */
  clear(): void {
    this.entries.clear()
    this.stats.hits = 0
    this.stats.misses = 0

    // Reset tracking structures
    this._totalSize = 0
    this.expirationIndex = []

    if (this.options.persistToDisk) {
      this.clearDisk()
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses

    return {
      totalEntries: this.entries.size,
      totalSize: this.getTotalSize(),
      hitRate: total > 0 ? this.stats.hits / total : 0,
      missRate: total > 0 ? this.stats.misses / total : 0,
      hits: this.stats.hits,
      misses: this.stats.misses,
    }
  }

  /**
   * Get or set with factory function
   */
  async getOrSet(key: string, factory: () => Promise<T> | T, ttl?: number): Promise<T> {
    const cached = this.get(key)

    if (cached !== undefined) {
      return cached
    }

    const value = await factory()
    this.set(key, value, ttl)

    return value
  }

  /**
   * Cleanup expired entries.
   * Optimized using expiration index - only processes expired entries,
   * not all entries. Time complexity: O(k) where k = number of expired entries.
   */
  private cleanup(): void {
    const now = Date.now()

    // Process expiration index from the beginning (earliest expirations first)
    // Only process entries that have actually expired
    while (this.expirationIndex.length > 0) {
      const first = this.expirationIndex[0]
      if (!first || first[0] > now) {
        // First entry hasn't expired yet, no more to process
        break
      }

      // Remove from index
      this.expirationIndex.shift()
      const [, key] = first

      // Check if the entry still exists and is actually expired
      // (it might have been updated with a new TTL)
      const entry = this.entries.get(key)
      if (entry && now - entry.timestamp > entry.ttl) {
        this.delete(key)
      }
    }
  }

  /**
   * Ensure cache capacity doesn't exceed limits
   */
  private ensureCapacity(newEntrySize: number): void {
    // Check entry count limit
    while (this.entries.size >= this.options.maxEntries) {
      this.evictOldest()
    }

    // Check size limit
    while (this.getTotalSize() + newEntrySize > this.options.maxSize) {
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
      this.delete(oldestKey)
    }
  }

  /**
   * Get total cache size. O(1) complexity using incremental tracking.
   */
  private getTotalSize(): number {
    return this._totalSize
  }

  /**
   * Estimate size of value in bytes
   */
  private estimateSize(value: T): number {
    try {
      return JSON.stringify(value).length * 2 // Rough UTF-16 estimate
    } catch {
      return 1000 // Default estimate for non-serializable values
    }
  }

  /**
   * Load cache from disk asynchronously.
   * Non-blocking disk cache initialization to avoid blocking CLI startup.
   * Initializes tracking structures when loading from disk.
   */
  private async loadFromDiskAsync(): Promise<void> {
    if (!this.options.persistToDisk) {
      return
    }

    try {
      // Check if cache directory exists
      try {
        await fsPromises.access(this.options.cacheDir)
      } catch {
        // Directory doesn't exist, nothing to load
        return
      }

      const indexPath = join(this.options.cacheDir, 'index.json')

      // Check if index file exists
      try {
        await fsPromises.access(indexPath)
      } catch {
        // Index doesn't exist, nothing to load
        return
      }

      const indexContent = await fsPromises.readFile(indexPath, 'utf-8')
      const index = JSON.parse(indexContent)

      // Load entries in parallel for better performance
      const loadPromises = (index.keys || []).map(async (key: string) => {
        try {
          const entryPath = join(this.options.cacheDir, this.getFilename(key))
          const entryContent = await fsPromises.readFile(entryPath, 'utf-8')
          const entry = JSON.parse(entryContent)

          // Check if entry is still valid
          if (Date.now() - entry.timestamp <= entry.ttl) {
            return { key, entry }
          }
        } catch {
          // Skip corrupted entries
        }
        return null
      })

      const results = await Promise.all(loadPromises)

      // Process results synchronously to avoid race conditions
      for (const result of results) {
        if (result) {
          const { key, entry } = result
          this.entries.set(key, entry)

          // Update tracking structures
          this._totalSize += entry.size
          const expirationTime = entry.timestamp + entry.ttl
          this.addToExpirationIndex(expirationTime, key)
        }
      }
    } catch {
      // Ignore disk loading errors
    }
  }

  /**
   * Save entry to disk (PERF-002: async to avoid blocking)
   * Fire-and-forget: errors are silently ignored, disk is just for persistence
   */
  private saveToDisk(key: string, entry: CacheEntry<T>): void {
    this.saveToDiskAsync(key, entry).catch(() => {
      // Ignore disk saving errors - memory cache is source of truth
    })
  }

  /**
   * Async implementation of disk saving
   */
  private async saveToDiskAsync(key: string, entry: CacheEntry<T>): Promise<void> {
    await fsPromises.mkdir(this.options.cacheDir, { recursive: true })
    const entryPath = join(this.options.cacheDir, this.getFilename(key))
    await fsPromises.writeFile(entryPath, JSON.stringify(entry), 'utf-8')
    await this.updateDiskIndexAsync()
  }

  /**
   * Delete entry from disk (PERF-002: async to avoid blocking)
   * Fire-and-forget: errors are silently ignored
   */
  private deleteFromDisk(key: string): void {
    this.deleteFromDiskAsync(key).catch(() => {
      // Ignore disk deletion errors
    })
  }

  /**
   * Async implementation of disk deletion
   */
  private async deleteFromDiskAsync(key: string): Promise<void> {
    const entryPath = join(this.options.cacheDir, this.getFilename(key))
    await fsPromises.unlink(entryPath).catch(() => {
      // File may not exist, ignore
    })
    await this.updateDiskIndexAsync()
  }

  /**
   * Clear disk cache (PERF-002: async to avoid blocking)
   * Fire-and-forget: errors are silently ignored
   */
  private clearDisk(): void {
    this.clearDiskAsync().catch(() => {
      // Ignore disk clearing errors
    })
  }

  /**
   * Async implementation of disk clearing
   */
  private async clearDiskAsync(): Promise<void> {
    await fsPromises.rm(this.options.cacheDir, { recursive: true, force: true }).catch(() => {
      // Directory may not exist, ignore
    })
  }

  /**
   * Async implementation of disk index update
   */
  private async updateDiskIndexAsync(): Promise<void> {
    await fsPromises.mkdir(this.options.cacheDir, { recursive: true })
    const indexPath = join(this.options.cacheDir, 'index.json')
    const index = {
      keys: Array.from(this.entries.keys()),
      lastUpdated: Date.now(),
    }
    await fsPromises.writeFile(indexPath, JSON.stringify(index), 'utf-8')
  }

  /**
   * Get filename for cache key
   */
  private getFilename(key: string): string {
    // Use hash to create safe filename
    const hash = createHash('md5').update(key).digest('hex')
    return `${hash}.json`
  }
}

/**
 * Package info structure cached by RegistryCache
 */
export interface CachedPackageInfo {
  name: string
  description?: string
  homepage?: string
  repository?: { type?: string; url?: string; directory?: string }
  license?: string
  author?: string | { name: string; email?: string }
  maintainers?: Array<{ name: string; email?: string }>
  keywords?: string[]
  versions: string[]
  latestVersion: string
  tags: Record<string, string>
  time?: Record<string, string>
}

/**
 * Security report structure cached by RegistryCache
 */
export interface CachedSecurityReport {
  package: string
  version: string
  vulnerabilities: Array<{
    id: string
    title: string
    severity: 'low' | 'moderate' | 'high' | 'critical'
    description: string
    reference: string
    vulnerable_versions: string
    patched_versions?: string
    recommendation?: string
  }>
  hasVulnerabilities: boolean
}

/**
 * Union type for all registry cache values
 */
type RegistryCacheValue = CachedPackageInfo | CachedSecurityReport | string[]

/**
 * Registry-specific cache for NPM API responses
 */
export class RegistryCache extends Cache<RegistryCacheValue> {
  constructor(options: CacheOptions = {}) {
    super('registry', {
      ttl: 3600000, // 1 hour
      maxSize: 10 * 1024 * 1024, // 10MB
      maxEntries: 500,
      persistToDisk: true,
      ...options,
    })
  }

  /**
   * Cache package info
   */
  setPackageInfo(packageName: string, info: CachedPackageInfo, ttl?: number): void {
    this.set(`package:${packageName}`, info, ttl)
  }

  /**
   * Get cached package info
   */
  getPackageInfo(packageName: string): CachedPackageInfo | undefined {
    return this.get(`package:${packageName}`) as CachedPackageInfo | undefined
  }

  /**
   * Cache version list
   */
  setVersions(packageName: string, versions: string[], ttl?: number): void {
    this.set(`versions:${packageName}`, versions, ttl)
  }

  /**
   * Get cached versions
   */
  getVersions(packageName: string): string[] | undefined {
    return this.get(`versions:${packageName}`) as string[] | undefined
  }

  /**
   * Cache security report
   */
  setSecurityReport(
    packageName: string,
    version: string,
    report: CachedSecurityReport,
    ttl?: number
  ): void {
    this.set(`security:${packageName}:${version}`, report, ttl)
  }

  /**
   * Get cached security report
   */
  getSecurityReport(packageName: string, version: string): CachedSecurityReport | undefined {
    return this.get(`security:${packageName}:${version}`) as CachedSecurityReport | undefined
  }
}

/**
 * Workspace info structure cached by WorkspaceCache
 */
export interface CachedWorkspaceInfo {
  path: string
  name: string
  packages: string[]
  catalogs?: Record<string, Record<string, string>>
}

/**
 * Package.json structure (subset of fields we use)
 */
export interface CachedPackageJson {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  [key: string]: unknown
}

/**
 * Union type for all workspace cache values
 */
type WorkspaceCacheValue = CachedWorkspaceInfo | CachedPackageJson

/**
 * Workspace-specific cache for file system operations
 */
export class WorkspaceCache extends Cache<WorkspaceCacheValue> {
  constructor(options: CacheOptions = {}) {
    super('workspace', {
      ttl: 300000, // 5 minutes (shorter TTL for file system)
      maxSize: 5 * 1024 * 1024, // 5MB
      maxEntries: 200,
      persistToDisk: false, // Don't persist workspace cache
      ...options,
    })
  }

  /**
   * Cache workspace info
   */
  setWorkspaceInfo(workspacePath: string, info: CachedWorkspaceInfo, ttl?: number): void {
    this.set(`workspace:${workspacePath}`, info, ttl)
  }

  /**
   * Get cached workspace info
   */
  getWorkspaceInfo(workspacePath: string): CachedWorkspaceInfo | undefined {
    return this.get(`workspace:${workspacePath}`) as CachedWorkspaceInfo | undefined
  }

  /**
   * Cache package.json content
   */
  setPackageJson(filePath: string, content: CachedPackageJson, ttl?: number): void {
    this.set(`package-json:${filePath}`, content, ttl)
  }

  /**
   * Get cached package.json
   */
  getPackageJson(filePath: string): CachedPackageJson | undefined {
    return this.get(`package-json:${filePath}`) as CachedPackageJson | undefined
  }
}

// Export singleton instances
export const registryCache = new RegistryCache()
export const workspaceCache = new WorkspaceCache()

/**
 * Initialize all disk-based caches asynchronously.
 * Call this function early in the CLI startup to begin loading cached data
 * in the background without blocking the main execution.
 *
 * @returns Promise that resolves when all caches are initialized
 */
export async function initializeCaches(): Promise<void> {
  await Promise.all([registryCache.initialize(), workspaceCache.initialize()])
}

/**
 * Start cache initialization in background (non-blocking).
 * This starts the initialization without awaiting, allowing the CLI
 * to continue startup while caches load in the background.
 *
 * @returns Promise for tracking (optional to await)
 */
export function startCacheInitialization(): Promise<void> {
  return initializeCaches().catch(() => {
    // Silently ignore initialization errors
    // Cache will work with empty state
  })
}
