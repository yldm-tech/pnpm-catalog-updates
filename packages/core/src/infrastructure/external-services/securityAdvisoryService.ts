/**
 * Security Advisory Service
 *
 * Provides real-time security vulnerability data from OSV (Open Source Vulnerabilities).
 * Uses the OSV API to query known vulnerabilities for npm packages.
 *
 * @see https://osv.dev/
 */

import { ExternalServiceError, logger, NetworkError, toError } from '@pcu/utils'

export interface VulnerabilityInfo {
  id: string
  aliases: string[] // CVE IDs, GHSA IDs, etc.
  summary: string
  details: string
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN'
  cvssScore?: number
  affectedVersions: string
  fixedVersions: string[]
  references: string[]
  publishedAt?: string
}

export interface SecurityAdvisoryReport {
  packageName: string
  version: string
  vulnerabilities: VulnerabilityInfo[]
  hasCriticalVulnerabilities: boolean
  hasHighVulnerabilities: boolean
  totalVulnerabilities: number
  queriedAt: Date
  source: 'osv' | 'npm-audit' | 'github-advisory'
}

interface OSVQueryResponse {
  vulns?: OSVVulnerability[]
}

/**
 * PERF-003: OSV Batch Query Response
 * @see https://google.github.io/osv.dev/api/#operation/OSV_QueryAffectedBatch
 */
interface OSVBatchQueryResponse {
  results: Array<{
    vulns?: OSVVulnerability[]
  }>
}

interface OSVVulnerability {
  id: string
  aliases?: string[]
  summary?: string
  details?: string
  severity?: Array<{
    type: string
    score: string
  }>
  affected?: Array<{
    ranges?: Array<{
      type: string
      events: Array<{ introduced?: string; fixed?: string }>
    }>
    versions?: string[]
  }>
  references?: Array<{
    type: string
    url: string
  }>
  published?: string
  database_specific?: {
    severity?: string
    cvss?: {
      score?: number
    }
  }
}

export class SecurityAdvisoryService {
  private readonly cache: Map<string, { data: SecurityAdvisoryReport; timestamp: number }> =
    new Map()
  private readonly cacheTimeout: number
  private readonly timeout: number
  private readonly discoveryTimeout: number
  private readonly checkEcosystem: boolean
  private readonly maxEcosystemPackages: number
  private readonly maxVersionsToCheck: number
  private readonly concurrency: number

  constructor(
    options: {
      cacheMinutes?: number
      /** Main API request timeout in ms (default: 10000) */
      timeout?: number
      /** Discovery request timeout in ms (default: 80% of main timeout) */
      discoveryTimeout?: number
      checkEcosystem?: boolean
      maxEcosystemPackages?: number
      maxVersionsToCheck?: number
      concurrency?: number
    } = {}
  ) {
    this.cacheTimeout = (options.cacheMinutes ?? 30) * 60 * 1000 // Default 30 minutes
    this.timeout = options.timeout ?? 10000 // Default 10 seconds
    // Discovery timeout defaults to 80% of main timeout for secondary requests
    this.discoveryTimeout = options.discoveryTimeout ?? Math.floor(this.timeout * 0.8)
    this.checkEcosystem = options.checkEcosystem ?? true // Default to checking ecosystem packages
    this.maxEcosystemPackages = options.maxEcosystemPackages ?? 20 // Limit ecosystem packages to prevent excessive API calls
    this.maxVersionsToCheck = options.maxVersionsToCheck ?? 10 // Default max versions to check for safe version
    this.concurrency = options.concurrency ?? 5 // Default 5 concurrent queries
  }

  /**
   * Discover related packages by:
   * 1. Inspecting the package's actual dependencies
   * 2. Finding sibling packages in the same monorepo (via repository URL)
   */
  private async discoverEcosystemPackages(packageName: string, version: string): Promise<string[]> {
    const relatedPackages: string[] = []

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.discoveryTimeout)

      // Fetch the package's package.json from npm registry
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`,
        { signal: controller.signal }
      )

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = (await response.json()) as {
          dependencies?: Record<string, string>
          peerDependencies?: Record<string, string>
          optionalDependencies?: Record<string, string>
          repository?: { url?: string; directory?: string } | string
        }

        // 1. Collect all dependencies
        const allDeps = new Set<string>()

        if (data.dependencies) {
          for (const dep of Object.keys(data.dependencies)) {
            allDeps.add(dep)
          }
        }

        if (data.peerDependencies) {
          for (const dep of Object.keys(data.peerDependencies)) {
            allDeps.add(dep)
          }
        }

        if (data.optionalDependencies) {
          for (const dep of Object.keys(data.optionalDependencies)) {
            allDeps.add(dep)
          }
        }

        for (const dep of allDeps) {
          if (!relatedPackages.includes(dep)) {
            relatedPackages.push(dep)
          }
        }

        // 2. If this is a monorepo package (has repository.directory), find sibling packages
        const repoUrl = typeof data.repository === 'string' ? data.repository : data.repository?.url
        const repoDir = typeof data.repository === 'object' ? data.repository?.directory : undefined

        if (repoUrl && repoDir) {
          // This is a monorepo package, try to find siblings
          const siblingPackages = await this.findMonorepoSiblings(packageName, repoUrl, version)
          for (const sibling of siblingPackages) {
            if (!relatedPackages.includes(sibling)) {
              relatedPackages.push(sibling)
            }
          }
        }
      }
    } catch (error) {
      // ERR-001: Best-effort discovery - log at debug level for troubleshooting
      logger.debug('Failed to discover ecosystem packages', {
        packageName,
        version,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return relatedPackages
  }

  /**
   * Find sibling packages in the same monorepo by:
   * 1. Searching npm for packages with related names
   * 2. Verifying they share the same repository URL
   * 3. Confirming they have the same version
   */
  private async findMonorepoSiblings(
    packageName: string,
    repoUrl: string,
    version: string
  ): Promise<string[]> {
    const siblings: string[] = []
    const normalizedRepoUrl = this.normalizeRepoUrl(repoUrl)

    try {
      // Search for packages using multiple search strategies to find monorepo siblings
      // These patterns cover common monorepo package naming conventions
      const searchQueries = [
        `${packageName}-dom`, // e.g., react-dom
        `${packageName}-server`, // e.g., react-server
        `${packageName}-server-dom`, // e.g., react-server-dom-webpack
        `${packageName}-native`, // e.g., react-native
        `${packageName}-test`, // e.g., react-test-renderer
        `${packageName}-reconciler`, // e.g., react-reconciler
        `${packageName}-refresh`, // e.g., react-refresh
        `${packageName}-devtools`, // e.g., react-devtools
      ]

      const foundPackages = new Set<string>()

      // Use shorter timeout for search queries (50% of discovery timeout)
      const searchTimeout = Math.floor(this.discoveryTimeout * 0.5)

      // PERF-002: Parallelize search queries instead of sequential execution
      const searchResults = await Promise.allSettled(
        searchQueries.map(async (query) => {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), searchTimeout)

          try {
            const response = await fetch(
              `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=50`,
              { signal: controller.signal }
            )

            clearTimeout(timeoutId)

            if (response.ok) {
              const data = (await response.json()) as {
                objects?: Array<{ package: { name: string } }>
              }
              return data.objects || []
            }
            return []
          } catch (error) {
            clearTimeout(timeoutId)
            // ERR-002: Continue with other queries - log at debug level
            logger.debug('Search query failed, continuing with others', {
              query,
              error: error instanceof Error ? error.message : String(error),
            })
            return []
          }
        })
      )

      // Collect results from all parallel searches
      for (const result of searchResults) {
        if (result.status === 'fulfilled') {
          for (const obj of result.value) {
            const pkgName = obj.package.name
            // Only consider packages that start with the main package name
            if (pkgName.startsWith(`${packageName}-`) && pkgName !== packageName) {
              foundPackages.add(pkgName)
            }
          }
        }
      }

      // PERF-002: Parallelize package verification instead of sequential execution
      // Verify each found package:
      // 1. Has the same version
      // 2. Shares the same repository URL (confirms it's from the same monorepo)
      const verificationResults = await Promise.allSettled(
        Array.from(foundPackages).map(async (pkgName) => {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), searchTimeout)

          try {
            const response = await fetch(
              `https://registry.npmjs.org/${encodeURIComponent(pkgName)}/${encodeURIComponent(version)}`,
              { signal: controller.signal }
            )

            clearTimeout(timeoutId)

            if (response.ok) {
              const data = (await response.json()) as {
                repository?: { url?: string } | string
              }

              // Verify it's from the same repository
              const pkgRepoUrl =
                typeof data.repository === 'string' ? data.repository : data.repository?.url

              if (pkgRepoUrl && this.normalizeRepoUrl(pkgRepoUrl) === normalizedRepoUrl) {
                return pkgName // Return the verified sibling package name
              }
            }
            return null
          } catch (error) {
            clearTimeout(timeoutId)
            // ERR-003: Skip packages we can't verify - log at debug level
            logger.debug('Failed to verify package sibling', {
              pkgName,
              version,
              error: error instanceof Error ? error.message : String(error),
            })
            return null
          }
        })
      )

      // Collect verified siblings
      for (const result of verificationResults) {
        if (result.status === 'fulfilled' && result.value !== null) {
          siblings.push(result.value)
        }
      }
    } catch (error) {
      // ERR-004: Best-effort sibling discovery - log at debug level
      logger.debug('Failed to find monorepo siblings', {
        packageName,
        repoUrl,
        version,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return siblings
  }

  /**
   * Normalize repository URL for comparison
   * e.g., "git+https://github.com/facebook/react.git" -> "github.com/facebook/react"
   */
  private normalizeRepoUrl(url: string): string {
    return url
      .replace(/^git\+/, '')
      .replace(/\.git$/, '')
      .replace(/^https?:\/\//, '')
      .replace(/^git:\/\//, '')
      .toLowerCase()
  }

  /**
   * Query vulnerabilities for a specific package version
   * Also checks ecosystem packages (e.g., react-server-dom-* for react) if enabled
   */
  async queryVulnerabilities(
    packageName: string,
    version: string
  ): Promise<SecurityAdvisoryReport> {
    const cacheKey = `${packageName}@${version}`

    // Check cache first
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data
    }

    try {
      // Query main package
      const report = await this.queryOSV(packageName, version)

      // If ecosystem checking is enabled, also check related packages (dependencies)
      if (this.checkEcosystem) {
        const ecosystemPackages = await this.discoverEcosystemPackages(packageName, version)

        // Apply safety limit to prevent excessive API calls
        const limitedEcosystemPackages = ecosystemPackages.slice(0, this.maxEcosystemPackages)

        if (limitedEcosystemPackages.length > 0) {
          // Query ecosystem packages in parallel
          const ecosystemReports = await Promise.all(
            limitedEcosystemPackages.map(async (pkgName) => {
              try {
                return await this.queryOSV(pkgName, version)
              } catch (error) {
                // ERR-005: Individual ecosystem package query failed - log at debug level
                logger.debug('Ecosystem package vulnerability query failed', {
                  pkgName,
                  version,
                  error: error instanceof Error ? error.message : String(error),
                })
                return null
              }
            })
          )

          // Merge ecosystem vulnerabilities into main report
          for (const ecoReport of ecosystemReports) {
            if (ecoReport && ecoReport.vulnerabilities.length > 0) {
              for (const vuln of ecoReport.vulnerabilities) {
                // Add source package info to vulnerability
                const vulnWithSource = {
                  ...vuln,
                  summary: `[${ecoReport.packageName}] ${vuln.summary}`,
                }
                // Avoid duplicates
                if (!report.vulnerabilities.some((v) => v.id === vuln.id)) {
                  report.vulnerabilities.push(vulnWithSource)
                }
              }
            }
          }

          // Re-sort and recalculate totals
          report.vulnerabilities.sort((a, b) => {
            const severityOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3, UNKNOWN: 4 }
            return severityOrder[a.severity] - severityOrder[b.severity]
          })
          report.totalVulnerabilities = report.vulnerabilities.length
          report.hasCriticalVulnerabilities = report.vulnerabilities.some(
            (v) => v.severity === 'CRITICAL'
          )
          report.hasHighVulnerabilities = report.vulnerabilities.some(
            (v) => v.severity === 'HIGH' || v.severity === 'CRITICAL'
          )
        }
      }

      // Cache the result
      this.cache.set(cacheKey, {
        data: report,
        timestamp: Date.now(),
      })

      return report
    } catch (error) {
      // Return empty report on error, don't block the analysis
      logger.error(
        `Security advisory query failed for ${packageName}@${version}`,
        error instanceof Error ? error : undefined
      )

      return {
        packageName,
        version,
        vulnerabilities: [],
        hasCriticalVulnerabilities: false,
        hasHighVulnerabilities: false,
        totalVulnerabilities: 0,
        queriedAt: new Date(),
        source: 'osv',
      }
    }
  }

  /**
   * PERF-003: Query OSV API for multiple packages in a single batch request
   * Uses the querybatch endpoint to reduce API calls by 80-90%
   * @see https://google.github.io/osv.dev/api/#operation/OSV_QueryAffectedBatch
   */
  private async queryOSVBatch(
    packages: Array<{ name: string; version: string }>
  ): Promise<Map<string, OSVQueryResponse>> {
    const results = new Map<string, OSVQueryResponse>()

    if (packages.length === 0) {
      return results
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const queries = packages.map((pkg) => ({
        package: {
          name: pkg.name,
          ecosystem: 'npm',
        },
        version: pkg.version,
      }))

      const response = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ queries }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new ExternalServiceError(
          'OSV',
          'querybatch',
          `API returned ${response.status}: ${response.statusText}`
        )
      }

      const data = (await response.json()) as OSVBatchQueryResponse

      // Map results back to package keys (results are in same order as queries)
      for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i]
        if (!pkg) continue
        const key = `${pkg.name}@${pkg.version}`
        const result = data.results[i]
        results.set(key, { vulns: result?.vulns })
      }

      return results
    } catch (error) {
      clearTimeout(timeoutId)

      if (toError(error).name === 'AbortError') {
        throw new NetworkError(
          'OSV',
          `batch request timed out after ${this.timeout}ms for ${packages.length} packages`
        )
      }
      throw error
    }
  }

  /**
   * Query OSV API for vulnerabilities
   * @see https://google.github.io/osv.dev/api/
   */
  private async queryOSV(packageName: string, version: string): Promise<SecurityAdvisoryReport> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          package: {
            name: packageName,
            ecosystem: 'npm',
          },
          version: version,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new ExternalServiceError(
          'OSV',
          'query',
          `API returned ${response.status}: ${response.statusText}`
        )
      }

      const data = (await response.json()) as OSVQueryResponse
      return this.parseOSVResponse(packageName, version, data)
    } catch (error) {
      clearTimeout(timeoutId)

      if (toError(error).name === 'AbortError') {
        throw new NetworkError(
          'OSV',
          `request timed out after ${this.timeout}ms for ${packageName}@${version}. Consider increasing timeout in config.`
        )
      }
      throw error
    }
  }

  /**
   * Parse OSV API response into our format
   */
  private parseOSVResponse(
    packageName: string,
    version: string,
    response: OSVQueryResponse
  ): SecurityAdvisoryReport {
    const vulnerabilities: VulnerabilityInfo[] = []

    if (response.vulns && response.vulns.length > 0) {
      for (const vuln of response.vulns) {
        const severity = this.extractSeverity(vuln)
        const cvssScore = this.extractCVSSScore(vuln)

        vulnerabilities.push({
          id: vuln.id,
          aliases: vuln.aliases || [],
          summary: vuln.summary || 'No summary available',
          details: vuln.details || '',
          severity,
          cvssScore,
          affectedVersions: this.extractAffectedVersions(vuln),
          fixedVersions: this.extractFixedVersions(vuln),
          references: this.extractReferences(vuln),
          publishedAt: vuln.published,
        })
      }
    }

    // Sort by severity (CRITICAL first)
    vulnerabilities.sort((a, b) => {
      const severityOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3, UNKNOWN: 4 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })

    return {
      packageName,
      version,
      vulnerabilities,
      hasCriticalVulnerabilities: vulnerabilities.some((v) => v.severity === 'CRITICAL'),
      hasHighVulnerabilities: vulnerabilities.some(
        (v) => v.severity === 'HIGH' || v.severity === 'CRITICAL'
      ),
      totalVulnerabilities: vulnerabilities.length,
      queriedAt: new Date(),
      source: 'osv',
    }
  }

  /**
   * Extract severity from OSV vulnerability
   */
  private extractSeverity(
    vuln: OSVVulnerability
  ): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN' {
    // Try database_specific first
    if (vuln.database_specific?.severity) {
      const severity = vuln.database_specific.severity.toUpperCase()
      if (['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].includes(severity)) {
        return severity as 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW'
      }
    }

    // Try CVSS score
    const cvssScore = this.extractCVSSScore(vuln)
    if (cvssScore !== undefined) {
      if (cvssScore >= 9.0) return 'CRITICAL'
      if (cvssScore >= 7.0) return 'HIGH'
      if (cvssScore >= 4.0) return 'MODERATE'
      return 'LOW'
    }

    // Check severity array
    if (vuln.severity && vuln.severity.length > 0) {
      const cvss = vuln.severity.find((s) => s.type === 'CVSS_V3')
      if (cvss) {
        const score = parseFloat(cvss.score)
        if (!Number.isNaN(score)) {
          if (score >= 9.0) return 'CRITICAL'
          if (score >= 7.0) return 'HIGH'
          if (score >= 4.0) return 'MODERATE'
          return 'LOW'
        }
      }
    }

    return 'UNKNOWN'
  }

  /**
   * Extract CVSS score from OSV vulnerability
   */
  private extractCVSSScore(vuln: OSVVulnerability): number | undefined {
    // Check database_specific first
    if (vuln.database_specific?.cvss?.score !== undefined) {
      return vuln.database_specific.cvss.score
    }

    // Check severity array
    if (vuln.severity && vuln.severity.length > 0) {
      const cvss = vuln.severity.find((s) => s.type === 'CVSS_V3')
      if (cvss) {
        const score = parseFloat(cvss.score)
        if (!Number.isNaN(score)) {
          return score
        }
      }
    }

    return undefined
  }

  /**
   * Extract affected versions string
   */
  private extractAffectedVersions(vuln: OSVVulnerability): string {
    if (!vuln.affected || vuln.affected.length === 0) {
      return 'Unknown'
    }

    const ranges: string[] = []

    for (const affected of vuln.affected) {
      if (affected.ranges) {
        for (const range of affected.ranges) {
          if (range.events) {
            let introduced = ''
            let fixed = ''

            for (const event of range.events) {
              if (event.introduced) introduced = event.introduced
              if (event.fixed) fixed = event.fixed
            }

            if (introduced && fixed) {
              ranges.push(`>=${introduced} <${fixed}`)
            } else if (introduced) {
              ranges.push(`>=${introduced}`)
            }
          }
        }
      }

      if (affected.versions && affected.versions.length > 0) {
        ranges.push(affected.versions.slice(0, 5).join(', '))
      }
    }

    return ranges.length > 0 ? ranges.join(' || ') : 'Unknown'
  }

  /**
   * Extract fixed versions
   */
  private extractFixedVersions(vuln: OSVVulnerability): string[] {
    const fixedVersions: string[] = []

    if (vuln.affected) {
      for (const affected of vuln.affected) {
        if (affected.ranges) {
          for (const range of affected.ranges) {
            if (range.events) {
              for (const event of range.events) {
                if (event.fixed) {
                  fixedVersions.push(event.fixed)
                }
              }
            }
          }
        }
      }
    }

    return [...new Set(fixedVersions)] // Remove duplicates
  }

  /**
   * Extract reference URLs
   */
  private extractReferences(vuln: OSVVulnerability): string[] {
    if (!vuln.references) {
      return []
    }

    return vuln.references
      .filter((ref) => ref.url)
      .map((ref) => ref.url)
      .slice(0, 5) // Limit to 5 references
  }

  /**
   * Batch query multiple packages
   * PERF-003: Uses OSV batch API to reduce API calls by 80-90%
   * ERROR-001: Uses timeout protection to prevent hangs
   */
  async queryMultiplePackages(
    packages: Array<{ name: string; version: string }>
  ): Promise<Map<string, SecurityAdvisoryReport>> {
    const results = new Map<string, SecurityAdvisoryReport>()

    if (packages.length === 0) {
      return results
    }

    // PERF-003: Separate cached and uncached packages
    const uncachedPackages: Array<{ name: string; version: string }> = []

    for (const pkg of packages) {
      const cacheKey = `${pkg.name}@${pkg.version}`
      const cached = this.cache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        results.set(cacheKey, cached.data)
      } else {
        uncachedPackages.push(pkg)
      }
    }

    if (uncachedPackages.length === 0) {
      return results
    }

    // PERF-003: Use batch API for uncached packages
    // OSV recommends batches of up to 1000 queries, we use smaller chunks for reliability
    const batchSize = 100
    const batches: Array<Array<{ name: string; version: string }>> = []

    for (let i = 0; i < uncachedPackages.length; i += batchSize) {
      batches.push(uncachedPackages.slice(i, i + batchSize))
    }

    for (const batch of batches) {
      try {
        // Query all packages in this batch with a single API call
        const batchResponses = await this.queryOSVBatch(batch)

        // Parse responses and build reports
        for (const pkg of batch) {
          const key = `${pkg.name}@${pkg.version}`
          const osvResponse = batchResponses.get(key)

          if (osvResponse) {
            const report = this.parseOSVResponse(pkg.name, pkg.version, osvResponse)

            // Cache the result
            this.cache.set(key, {
              data: report,
              timestamp: Date.now(),
            })

            results.set(key, report)
          } else {
            // No response for this package, create empty report
            const emptyReport: SecurityAdvisoryReport = {
              packageName: pkg.name,
              version: pkg.version,
              vulnerabilities: [],
              hasCriticalVulnerabilities: false,
              hasHighVulnerabilities: false,
              totalVulnerabilities: 0,
              queriedAt: new Date(),
              source: 'osv',
            }
            results.set(key, emptyReport)
          }
        }
      } catch (error) {
        // On batch failure, fall back to individual queries for this batch
        logger.warn('OSV batch query failed, falling back to individual queries', {
          error: error instanceof Error ? error.message : String(error),
          packagesInBatch: batch.length,
        })

        // ERROR-001: Use Promise.allSettled with concurrency limit to prevent indefinite hangs
        const fallbackChunks: Array<Array<{ name: string; version: string }>> = []
        for (let i = 0; i < batch.length; i += this.concurrency) {
          fallbackChunks.push(batch.slice(i, i + this.concurrency))
        }

        for (const chunk of fallbackChunks) {
          const chunkTimeout = chunk.length * (this.timeout + 1000)
          const promises = chunk.map(async (pkg) => {
            const report = await this.queryVulnerabilities(pkg.name, pkg.version)
            return { pkg, report }
          })

          const chunkResults = await Promise.race([
            Promise.allSettled(promises),
            new Promise<
              PromiseSettledResult<{
                pkg: { name: string; version: string }
                report: SecurityAdvisoryReport
              }>[]
            >((_, reject) => {
              setTimeout(() => reject(new Error('Fallback query timeout')), chunkTimeout)
            }),
          ]).catch(() => {
            return [] as PromiseSettledResult<{
              pkg: { name: string; version: string }
              report: SecurityAdvisoryReport
            }>[]
          })

          for (const result of chunkResults) {
            if (result.status === 'fulfilled') {
              results.set(
                `${result.value.pkg.name}@${result.value.pkg.version}`,
                result.value.report
              )
            }
          }
        }
      }
    }

    return results
  }

  /**
   * Format vulnerabilities for AI prompt context
   */
  formatForPrompt(report: SecurityAdvisoryReport): string {
    if (report.totalVulnerabilities === 0) {
      return `No known vulnerabilities found for ${report.packageName}@${report.version}`
    }

    const lines: string[] = []
    lines.push(
      `⚠️ SECURITY ALERT: ${report.totalVulnerabilities} vulnerability(ies) found for ${report.packageName}@${report.version}:`
    )

    for (const vuln of report.vulnerabilities) {
      const cveIds = vuln.aliases.filter((a) => a.startsWith('CVE-')).join(', ') || vuln.id
      const scoreStr = vuln.cvssScore ? ` (CVSS: ${vuln.cvssScore})` : ''

      lines.push(`  - [${vuln.severity}]${scoreStr} ${cveIds}: ${vuln.summary}`)

      if (vuln.fixedVersions.length > 0) {
        lines.push(`    Fixed in: ${vuln.fixedVersions.join(', ')}`)
      }
    }

    if (report.hasCriticalVulnerabilities) {
      lines.push(
        '\n🚨 CRITICAL: This version has CRITICAL security vulnerabilities. DO NOT recommend updating to this version!'
      )
    } else if (report.hasHighVulnerabilities) {
      lines.push(
        '\n⚠️ HIGH RISK: This version has HIGH severity vulnerabilities. Consider alternative versions.'
      )
    }

    return lines.join('\n')
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Find a safe version (without critical/high vulnerabilities) newer than the given version.
   * This method checks versions in order from the given version upward until it finds one
   * that has no critical or high severity vulnerabilities.
   *
   * @param packageName - The npm package name
   * @param currentVersion - The version to start searching from
   * @param maxVersionsToCheck - Maximum number of versions to check (defaults to instance config)
   * @returns Information about the safe version found, or undefined if none found
   */
  async findSafeVersion(
    packageName: string,
    currentVersion: string,
    maxVersionsToCheck?: number
  ): Promise<
    | {
        version: string
        sameMajor: boolean
        sameMinor: boolean
        versionsChecked: number
        skippedVersions: Array<{
          version: string
          vulnerabilities: Array<{
            id: string
            severity: string
            summary: string
          }>
        }>
      }
    | undefined
  > {
    try {
      // Fetch package versions from npm registry
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
        { signal: controller.signal }
      )

      clearTimeout(timeoutId)

      if (!response.ok) {
        return undefined
      }

      const data = (await response.json()) as {
        versions: Record<string, unknown>
        time?: Record<string, string>
      }

      // Get all versions and sort them semantically
      const allVersions = Object.keys(data.versions)

      // Parse current version for comparison
      const currentParts = this.parseVersion(currentVersion)
      if (!currentParts) {
        return undefined
      }

      // Use instance config as default, allow parameter override
      const versionsLimit = maxVersionsToCheck ?? this.maxVersionsToCheck

      // Filter to versions >= currentVersion and sort in ascending order
      const candidateVersions = allVersions
        .filter((v) => {
          const parts = this.parseVersion(v)
          if (!parts) return false
          // Only consider stable versions (no prereleases)
          if (parts.prerelease) return false
          // Must be >= currentVersion
          return this.compareVersions(parts, currentParts) > 0
        })
        .sort((a, b) => {
          const partsA = this.parseVersion(a)
          const partsB = this.parseVersion(b)
          if (!partsA || !partsB) return 0
          return this.compareVersions(partsA, partsB)
        })
        .slice(0, versionsLimit)

      if (candidateVersions.length === 0) {
        return undefined
      }

      // Track skipped versions with their vulnerabilities
      const skippedVersions: Array<{
        version: string
        vulnerabilities: Array<{
          id: string
          severity: string
          summary: string
        }>
      }> = []

      // Check each candidate version for vulnerabilities
      let versionsChecked = 0
      for (const candidateVersion of candidateVersions) {
        versionsChecked++

        // Query vulnerabilities for this version (including ecosystem packages)
        const report = await this.queryVulnerabilities(packageName, candidateVersion)

        // Collect all vulnerabilities (main package + ecosystem)
        const allVulnerabilities: Array<{
          id: string
          severity: string
          summary: string
        }> = report.vulnerabilities.map((v) => ({
          id: v.id,
          severity: v.severity,
          summary: v.summary,
        }))

        // Check if this version is safe (no critical/high vulnerabilities)
        const hasDangerousVulns = report.hasCriticalVulnerabilities || report.hasHighVulnerabilities

        if (!hasDangerousVulns) {
          // Found a safe version!
          const candidateParts = this.parseVersion(candidateVersion)
          if (!candidateParts) continue

          return {
            version: candidateVersion,
            sameMajor: candidateParts.major === currentParts.major,
            sameMinor:
              candidateParts.major === currentParts.major &&
              candidateParts.minor === currentParts.minor,
            versionsChecked,
            skippedVersions,
          }
        } else {
          // This version has vulnerabilities, add to skipped list
          skippedVersions.push({
            version: candidateVersion,
            vulnerabilities: allVulnerabilities,
          })
        }
      }

      // No safe version found within the limit
      return undefined
    } catch (error) {
      logger.error(
        `Failed to find safe version for ${packageName}@${currentVersion}`,
        error instanceof Error ? error : undefined
      )
      return undefined
    }
  }

  /**
   * Parse a semver version string into parts
   */
  private parseVersion(
    version: string
  ): { major: number; minor: number; patch: number; prerelease?: string } | null {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
    if (!match || !match[1] || !match[2] || !match[3]) return null

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4],
    }
  }

  /**
   * Compare two parsed versions
   * Returns: negative if a < b, 0 if a == b, positive if a > b
   */
  private compareVersions(
    a: { major: number; minor: number; patch: number },
    b: { major: number; minor: number; patch: number }
  ): number {
    if (a.major !== b.major) return a.major - b.major
    if (a.minor !== b.minor) return a.minor - b.minor
    return a.patch - b.patch
  }
}
