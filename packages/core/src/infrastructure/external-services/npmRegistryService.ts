/**
 * NPM Registry Service
 *
 * Provides access to NPM registry for package version information.
 * Handles API calls, caching, and version resolution.
 */

import { type AdvancedConfig, UserFriendlyErrorHandler } from '@pcu/utils'
import npmRegistryFetch from 'npm-registry-fetch'
import pacote from 'pacote'
import semver from 'semver'
import { Version, type VersionRange } from '../../domain/value-objects/version.js'
import { type NpmrcConfig, NpmrcParser } from '../utils/npmrcParser.js'

export interface PackageInfo {
  name: string
  description?: string
  homepage?: string
  repository?: {
    type?: string
    url?: string
    directory?: string
  }
  license?: string
  author?: string | { name: string; email?: string }
  maintainers?: Array<{ name: string; email?: string }>
  keywords?: string[]
  versions: string[]
  latestVersion: string
  tags: Record<string, string>
  time?: Record<string, string>
}

export interface SecurityVulnerability {
  id: string
  title: string
  severity: 'low' | 'moderate' | 'high' | 'critical'
  description: string
  reference: string
  vulnerable_versions: string
  patched_versions?: string
  recommendation?: string
}

export interface SecurityReport {
  package: string
  version: string
  vulnerabilities: SecurityVulnerability[]
  hasVulnerabilities: boolean
}

/**
 * NPM packument response structure (subset we use)
 */
interface NpmPackument {
  name: string
  'dist-tags': Record<string, string>
  versions: Record<string, NpmVersionManifest>
  time?: Record<string, string>
  description?: string
  homepage?: string
  repository?: { type?: string; url?: string; directory?: string }
  license?: string
  author?: string | { name: string; email?: string }
  maintainers?: Array<{ name: string; email?: string }>
  keywords?: string[]
}

/**
 * NPM version manifest structure
 */
interface NpmVersionManifest {
  name: string
  version: string
  author?: string | { name: string; email?: string }
  [key: string]: unknown
}

/**
 * NPM audit advisory structure
 */
interface NpmAuditAdvisory {
  id: number
  title: string
  severity: 'low' | 'moderate' | 'high' | 'critical'
  overview: string
  url: string
  vulnerable_versions: string
  patched_versions?: string
  recommendation?: string
}

/**
 * NPM audit response structure
 */
interface NpmAuditResponse {
  advisories?: Record<string, NpmAuditAdvisory>
}

/**
 * NPM download stats response
 */
interface NpmDownloadStats {
  downloads?: number
  package?: string
  start?: string
  end?: string
}

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T
  timestamp: number
}

/**
 * Author type used in package manifests
 */
type PackageAuthor = string | { name: string; email?: string } | undefined

/**
 * Package versions cache structure
 */
interface PackageVersionsData {
  name: string
  versions: string[]
  latestVersion: string
  tags: Record<string, string>
  time?: Record<string, string>
}

export class NpmRegistryService {
  private readonly cache: Map<string, CacheEntry<unknown>> = new Map()

  // Differentiated cache timeouts for different data types
  private readonly versionCacheTimeout: number
  private readonly packageInfoCacheTimeout: number
  private readonly securityCacheTimeout: number

  // Advanced configuration with defaults
  private readonly concurrency: number
  private readonly timeout: number
  private readonly retries: number
  private readonly cachingEnabled: boolean

  // NPM configuration for handling multiple registries
  private readonly npmrcConfig: NpmrcConfig

  constructor(
    registryUrl: string = 'https://registry.npmjs.org/',
    options: AdvancedConfig = {},
    workingDirectory: string = process.cwd()
  ) {
    // Parse npmrc configuration for scoped registries
    this.npmrcConfig = NpmrcParser.parse(workingDirectory)

    // Override default registry if specified in npmrc
    if (!registryUrl || registryUrl === 'https://registry.npmjs.org/') {
      // Use npmrc registry as default if no specific registry is provided
      const normalizedUrl = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`
      this.npmrcConfig.registry = this.npmrcConfig.registry || normalizedUrl
    } else {
      // Use the provided registry URL as override
      this.npmrcConfig.registry = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`
    }
    this.concurrency = options.concurrency ?? 8 // Increased from 5 to match NCU performance
    this.timeout = options.timeout ?? 15000 // Reduced from 30s to 15s for faster failure detection
    this.retries = options.retries ?? 2 // Reduced from 3 to 2 for faster overall performance

    // Optimized cache timeouts for different data types
    const baseCacheMinutes = options.cacheValidityMinutes ?? 10 // Reduced from 60 to 10 minutes
    this.versionCacheTimeout = baseCacheMinutes * 60 * 1000 // Version info: 10 minutes (frequently checked)
    this.packageInfoCacheTimeout = baseCacheMinutes * 2 * 60 * 1000 // Package info: 20 minutes
    this.securityCacheTimeout = baseCacheMinutes * 6 * 60 * 1000 // Security info: 60 minutes (changes less frequently)

    this.cachingEnabled = baseCacheMinutes > 0 // Disable caching if set to 0
  }

  /**
   * Execute a function with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error as Error

        if (attempt === this.retries) {
          throw new Error(`${context} failed after ${this.retries} attempts: ${lastError.message}`)
        }

        // Exponential backoff: wait 1s, 2s, 4s, etc.
        const delay = Math.min(1000 * 2 ** (attempt - 1), 10000)
        await new Promise((resolve) => setTimeout(resolve, delay))

        // Extract package name from context for better error handling
        const packageName = context.includes('for ')
          ? context.split('for ')[1] || 'unknown package'
          : 'unknown package'

        UserFriendlyErrorHandler.handleRetryAttempt(packageName, attempt, this.retries, lastError)
      }
    }

    throw lastError!
  }

  /**
   * Get the appropriate registry URL for a package
   */
  private getRegistryForPackage(packageName: string): string {
    return NpmrcParser.getRegistryForPackage(packageName, this.npmrcConfig)
  }

  /**
   * Get auth configuration for a registry
   */
  private getAuthConfig(registryUrl: string): Record<string, string> {
    const authToken = NpmrcParser.getAuthToken(registryUrl, this.npmrcConfig)
    if (authToken) {
      return {
        '//registry.npmjs.org/:_authToken': authToken,
        token: authToken,
      }
    }
    return {}
  }

  /**
   * Get lightweight package version information (optimized for performance)
   */
  async getPackageVersions(packageName: string): Promise<PackageVersionsData> {
    const registryUrl = this.getRegistryForPackage(packageName)
    const cacheKey = `package-versions:${registryUrl}:${packageName}`

    // Check cache first if caching is enabled
    if (this.cachingEnabled) {
      const cached = this.getFromCache<PackageVersionsData>(cacheKey)
      if (cached) {
        return cached
      }
    }

    const packageVersions = await this.executeWithRetry(async () => {
      // Use lightweight packument call without fullMetadata
      const authConfig = this.getAuthConfig(registryUrl)
      const packument = await pacote.packument(packageName, {
        registry: registryUrl,
        timeout: this.timeout,
        fullMetadata: false, // Key optimization: don't fetch full metadata
        ...authConfig,
      })

      const versions = Object.keys(packument.versions || {}).sort(semver.rcompare)
      const latestVersion = packument['dist-tags']?.latest || versions[0] || ''
      const npmPackument = packument as NpmPackument

      return {
        name: packument.name,
        versions,
        latestVersion,
        tags: packument['dist-tags'] || {},
        time: npmPackument.time || {}, // Still include time for newest versions feature
      }
    }, `Fetching package versions for ${packageName}`)

    // Cache the result if caching is enabled
    if (this.cachingEnabled) {
      this.setCache(cacheKey, packageVersions)
    }

    return packageVersions
  }

  /**
   * Get package information including all versions
   * @deprecated Use getPackageVersions() for better performance
   */
  async getPackageInfo(packageName: string): Promise<PackageInfo> {
    const registryUrl = this.getRegistryForPackage(packageName)
    const cacheKey = `package-info:${registryUrl}:${packageName}`

    // Check cache first if caching is enabled
    if (this.cachingEnabled) {
      const cached = this.getFromCache<PackageInfo>(cacheKey)
      if (cached) {
        return cached
      }
    }

    // Use lightweight version and extend with additional metadata only if needed
    const versionInfo = await this.getPackageVersions(packageName)

    const packageInfo = await this.executeWithRetry(async () => {
      // Only fetch full metadata if we actually need the extended info
      const authConfig = this.getAuthConfig(registryUrl)
      const packument = await pacote.packument(packageName, {
        registry: registryUrl,
        timeout: this.timeout,
        fullMetadata: true,
        ...authConfig,
      })

      const npmPackument = packument as NpmPackument
      return {
        name: versionInfo.name,
        description: npmPackument.description,
        homepage: npmPackument.homepage,
        repository: npmPackument.repository,
        license: npmPackument.license,
        author: npmPackument.author,
        maintainers: npmPackument.maintainers,
        keywords: npmPackument.keywords,
        versions: versionInfo.versions,
        latestVersion: versionInfo.latestVersion,
        tags: versionInfo.tags,
        time: versionInfo.time || {},
      }
    }, `Fetching package info for ${packageName}`)

    // Cache the result if caching is enabled
    if (this.cachingEnabled) {
      this.setCache(cacheKey, packageInfo)
    }

    return packageInfo
  }

  /**
   * Get the latest version of a package
   */
  async getLatestVersion(packageName: string): Promise<Version> {
    try {
      const versionInfo = await this.getPackageVersions(packageName)
      return Version.fromString(versionInfo.latestVersion)
    } catch (error) {
      throw new Error(`Failed to get latest version for ${packageName}: ${error}`)
    }
  }

  /**
   * Get the greatest version that satisfies a range
   */
  async getGreatestVersion(packageName: string, range?: VersionRange): Promise<Version> {
    try {
      const versionInfo = await this.getPackageVersions(packageName)

      if (!range) {
        return Version.fromString(versionInfo.latestVersion)
      }

      // Find the greatest version that satisfies the range
      const satisfyingVersions = versionInfo.versions.filter((v) => {
        try {
          const version = Version.fromString(v)
          return version.satisfies(range)
        } catch {
          return false
        }
      })

      if (satisfyingVersions.length === 0) {
        throw new Error(`No versions satisfy range ${range.toString()}`)
      }

      // Return the first (greatest) version
      if (!satisfyingVersions[0]) {
        throw new Error(`No satisfying versions found for ${packageName}`)
      }
      return Version.fromString(satisfyingVersions[0])
    } catch (error) {
      throw new Error(`Failed to get greatest version for ${packageName}: ${error}`)
    }
  }

  /**
   * Get versions by date (newest versions published)
   */
  async getNewestVersions(packageName: string, count: number = 10): Promise<Version[]> {
    try {
      const versionInfo = await this.getPackageVersions(packageName)

      // Sort versions by publication time
      const versionsWithTime = versionInfo.versions
        .map((version) => ({
          version,
          time: versionInfo.time?.[version] ? new Date(versionInfo.time[version]) : new Date(0),
        }))
        .sort((a, b) => b.time.getTime() - a.time.getTime())
        .slice(0, count)

      return versionsWithTime.map((item) => Version.fromString(item.version))
    } catch (error) {
      throw new Error(`Failed to get newest versions for ${packageName}: ${error}`)
    }
  }

  /**
   * Check for security vulnerabilities
   */
  async checkSecurityVulnerabilities(
    packageName: string,
    version: string
  ): Promise<SecurityReport> {
    const registryUrl = this.getRegistryForPackage(packageName)
    const cacheKey = `security:${registryUrl}:${packageName}@${version}`

    // Check cache first
    const cached = this.getFromCache<SecurityReport>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      // Use npm audit API
      const auditData = {
        name: packageName,
        version: version,
        requires: {},
        dependencies: {},
      }

      const authConfig = this.getAuthConfig(registryUrl)
      const response = await npmRegistryFetch('/-/npm/v1/security/audits', {
        method: 'POST',
        body: JSON.stringify(auditData),
        headers: {
          'Content-Type': 'application/json',
        },
        registry: registryUrl,
        timeout: this.timeout,
        ...authConfig,
      })

      const auditResult = (await response.json()) as NpmAuditResponse
      const vulnerabilities: SecurityVulnerability[] = []

      // Parse audit results
      if (auditResult.advisories) {
        for (const advisory of Object.values(auditResult.advisories)) {
          vulnerabilities.push({
            id: advisory.id.toString(),
            title: advisory.title,
            severity: advisory.severity,
            description: advisory.overview,
            reference: advisory.url,
            vulnerable_versions: advisory.vulnerable_versions,
            patched_versions: advisory.patched_versions,
            recommendation: advisory.recommendation,
          })
        }
      }

      const securityReport: SecurityReport = {
        package: packageName,
        version: version,
        vulnerabilities,
        hasVulnerabilities: vulnerabilities.length > 0,
      }

      // Cache the result
      this.setCache(cacheKey, securityReport)

      return securityReport
    } catch (error) {
      // If security check fails, return empty report
      UserFriendlyErrorHandler.handleSecurityCheckFailure(packageName, error as Error)

      const emptyReport: SecurityReport = {
        package: packageName,
        version: version,
        vulnerabilities: [],
        hasVulnerabilities: false,
      }

      return emptyReport
    }
  }

  /**
   * Batch query multiple packages with progress tracking
   */
  async batchQueryVersions(
    packages: string[],
    progressCallback?: (completed: number, total: number, currentPackage: string) => void
  ): Promise<Map<string, PackageInfo>> {
    const results = new Map<string, PackageInfo>()
    let completed = 0
    const total = packages.length

    // Process packages in parallel with configurable concurrency
    const chunks = this.chunkArray(packages, this.concurrency)

    for (const chunk of chunks) {
      const promises = chunk.map(async (packageName) => {
        try {
          const info = await this.getPackageInfo(packageName)
          results.set(packageName, info)

          // Update progress
          completed++
          if (progressCallback) {
            progressCallback(completed, total, packageName)
          }
        } catch (error) {
          // Still count failed packages in progress
          completed++
          if (progressCallback) {
            progressCallback(completed, total, packageName)
          }
          UserFriendlyErrorHandler.handlePackageQueryFailure(packageName, error as Error)
        }
      })

      await Promise.all(promises)
    }

    return results
  }

  /**
   * Check if package author has changed
   */
  async hasPackageAuthorChanged(
    packageName: string,
    fromVersion: string,
    toVersion: string
  ): Promise<boolean> {
    try {
      // const packageInfo = await this.getPackageInfo(packageName);

      const registryUrl = this.getRegistryForPackage(packageName)
      const authConfig = this.getAuthConfig(registryUrl)

      const fromVersionData = await pacote.manifest(`${packageName}@${fromVersion}`, {
        registry: registryUrl,
        timeout: this.timeout,
        ...authConfig,
      })

      const toVersionData = await pacote.manifest(`${packageName}@${toVersion}`, {
        registry: registryUrl,
        timeout: this.timeout,
        ...authConfig,
      })

      // Compare authors/maintainers
      const fromManifest = fromVersionData as unknown as NpmVersionManifest
      const toManifest = toVersionData as unknown as NpmVersionManifest
      const fromAuthor = this.normalizeAuthor(fromManifest.author)
      const toAuthor = this.normalizeAuthor(toManifest.author)

      return fromAuthor !== toAuthor
    } catch (error) {
      // Log for debugging, don't show to user as this is not critical
      UserFriendlyErrorHandler.handlePackageQueryFailure(packageName, error as Error, {
        operation: 'author-check',
      })
      return false
    }
  }

  /**
   * Get package download statistics
   */
  async getDownloadStats(
    packageName: string,
    period: 'last-day' | 'last-week' | 'last-month' = 'last-week'
  ): Promise<number> {
    try {
      const response = await fetch(`https://api.npmjs.org/downloads/point/${period}/${packageName}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = (await response.json()) as NpmDownloadStats
      return data.downloads ?? 0
    } catch (error) {
      // Log for debugging, don't show to user as this is not critical
      UserFriendlyErrorHandler.handlePackageQueryFailure(packageName, error as Error, {
        operation: 'download-stats',
      })
      return 0
    }
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Clear cache by type
   */
  clearCacheByType(type: 'versions' | 'package-info' | 'security' | 'all' = 'all'): void {
    if (type === 'all') {
      this.clearCache()
      return
    }

    const prefix =
      type === 'versions'
        ? 'package-versions:'
        : type === 'package-info'
          ? 'package-info:'
          : 'security:'

    const keysToDelete: string[] = []
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key))
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    total: number
    versions: number
    packageInfo: number
    security: number
    expired: number
  } {
    const stats = { total: 0, versions: 0, packageInfo: 0, security: 0, expired: 0 }
    const now = Date.now()

    for (const [key, cached] of this.cache.entries()) {
      stats.total++

      const timeout = this.getCacheTimeout(key)
      if (now - cached.timestamp > timeout) {
        stats.expired++
        continue
      }

      if (key.startsWith('package-versions:')) {
        stats.versions++
      } else if (key.startsWith('package-info:')) {
        stats.packageInfo++
      } else if (key.startsWith('security:')) {
        stats.security++
      }
    }

    return stats
  }

  /**
   * Get item from cache if not expired
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) {
      return null
    }

    // Determine timeout based on cache key type
    const timeout = this.getCacheTimeout(key)

    if (Date.now() - cached.timestamp > timeout) {
      this.cache.delete(key)
      return null
    }

    return cached.data as T
  }

  /**
   * Get appropriate cache timeout based on key type
   */
  private getCacheTimeout(key: string): number {
    if (key.startsWith('package-versions:')) {
      return this.versionCacheTimeout
    } else if (key.startsWith('security:')) {
      return this.securityCacheTimeout
    } else if (key.startsWith('package-info:')) {
      return this.packageInfoCacheTimeout
    }

    // Default to version cache timeout for unknown keys
    return this.versionCacheTimeout
  }

  /**
   * Set item in cache
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  /**
   * Normalize author for comparison
   */
  private normalizeAuthor(author: PackageAuthor): string {
    if (typeof author === 'string') {
      return author.toLowerCase().trim()
    }
    if (typeof author === 'object' && author?.name) {
      return author.name.toLowerCase().trim()
    }
    return ''
  }
}
