/**
 * AI Analysis Service
 *
 * Core application service that orchestrates AI-powered dependency analysis.
 * Handles provider selection, caching, fallback strategies, and result aggregation.
 */

import { AIAnalysisError, logger } from '@pcu/utils'
import type {
  AIConfig,
  AIProvider,
  AIProviderInfo,
  AnalysisContext,
  AnalysisResult,
  AnalysisType,
  PackageUpdateInfo,
  Recommendation,
  SecurityVulnerabilityData,
  WorkspaceInfo,
} from '../../domain/interfaces/aiProvider.js'
import { AIDetector } from '../../infrastructure/ai/aiDetector.js'
import { type AnalysisCache, analysisCache } from '../../infrastructure/ai/cache/analysisCache.js'
import { RuleEngine } from '../../infrastructure/ai/fallback/ruleEngine.js'
import { ClaudeProvider } from '../../infrastructure/ai/providers/claudeProvider.js'
import { CodexProvider } from '../../infrastructure/ai/providers/codexProvider.js'
import { GeminiProvider } from '../../infrastructure/ai/providers/geminiProvider.js'
import { SecurityAdvisoryService } from '../../infrastructure/external-services/securityAdvisoryService.js'

/**
 * Service options
 */
export interface AIAnalysisServiceOptions {
  config?: Partial<AIConfig>
  cache?: AnalysisCache
  detector?: AIDetector
  /**
   * Optional preconfigured provider instances.
   * When provided, the service will not auto-initialize built-in providers.
   */
  providers?: AIProvider[]
}

/**
 * Chunking configuration for large package sets
 */
export interface ChunkingConfig {
  /** Enable chunking for large package sets (default: true) */
  enabled?: boolean
  /** Maximum packages per chunk (default: 30) */
  chunkSize?: number
  /** Threshold to trigger chunking (default: 50) */
  threshold?: number
  /** Progress callback for chunked analysis */
  onProgress?: (progress: ChunkProgress) => void
}

/**
 * Chunk progress information
 */
export interface ChunkProgress {
  currentChunk: number
  totalChunks: number
  processedPackages: number
  totalPackages: number
  percentComplete: number
}

/**
 * Analysis request options
 */
export interface AnalysisRequestOptions {
  analysisType?: AnalysisType
  provider?: string // Specific provider to use
  skipCache?: boolean
  timeout?: number
  /** Chunking configuration for large package sets */
  chunking?: ChunkingConfig
}

/**
 * Multi-provider analysis result
 */
export interface MultiAnalysisResult {
  primary: AnalysisResult
  secondary?: AnalysisResult
  merged?: AnalysisResult
  providers: string[]
  timestamp: Date
}

/**
 * AI Analysis Service
 *
 * Provides high-level API for AI-powered dependency analysis.
 */
export class AIAnalysisService {
  private readonly config: AIConfig
  private readonly cache: AnalysisCache
  private readonly detector: AIDetector
  private readonly ruleEngine: RuleEngine
  private readonly securityService: SecurityAdvisoryService
  private readonly providers: Map<string, AIProvider> = new Map()
  private providersInitialized = false

  constructor(options: AIAnalysisServiceOptions = {}) {
    this.config = this.buildConfig(options.config)
    this.cache = options.cache ?? analysisCache
    this.detector = options.detector ?? new AIDetector()
    this.ruleEngine = new RuleEngine()
    this.securityService = new SecurityAdvisoryService({
      cacheMinutes: 30,
      timeout: this.config.securityData?.timeout ?? 10000,
      concurrency: this.config.securityData?.concurrency ?? 5,
    })

    if (options.providers) {
      for (const provider of options.providers) {
        this.providers.set(provider.name, provider)
      }
      this.providersInitialized = true
    }
  }

  /**
   * Build configuration with defaults
   */
  private buildConfig(userConfig?: Partial<AIConfig>): AIConfig {
    return {
      enabled: userConfig?.enabled ?? true,
      preferredProvider: userConfig?.preferredProvider ?? 'auto',
      providers: userConfig?.providers ?? {},
      analysisTypes: userConfig?.analysisTypes ?? [
        'impact',
        'security',
        'compatibility',
        'recommend',
      ],
      cache: {
        enabled: userConfig?.cache?.enabled ?? true,
        ttl: userConfig?.cache?.ttl ?? 3600,
      },
      fallback: {
        enabled: userConfig?.fallback?.enabled ?? true,
        useRuleEngine: userConfig?.fallback?.useRuleEngine ?? true,
      },
      securityData: {
        enabled: userConfig?.securityData?.enabled ?? true,
      },
    }
  }

  /**
   * Initialize providers (lazy initialization)
   * PERF-004: Parallelized provider availability checks
   */
  private async initializeProviders(): Promise<void> {
    if (this.providersInitialized) {
      return
    }

    // Create all provider instances
    const providerCandidates: Array<{ name: string; provider: AIProvider }> = [
      { name: 'claude', provider: new ClaudeProvider(this.config.providers.claude) },
      { name: 'gemini', provider: new GeminiProvider(this.config.providers.gemini) },
      { name: 'codex', provider: new CodexProvider(this.config.providers.codex) },
    ]

    // PERF-004: Check availability in parallel
    const availabilityChecks = await Promise.all(
      providerCandidates.map(async ({ name, provider }) => ({
        name,
        provider,
        available: await provider.isAvailable(),
      }))
    )

    // Register available providers
    for (const { name, provider, available } of availabilityChecks) {
      if (available) {
        this.providers.set(name, provider)
      }
    }

    // Future: Initialize additional providers
    // const cursorProvider = new CursorProvider(this.config.providers.cursor);
    // const aiderProvider = new AiderProvider(this.config.providers.aider);

    this.providersInitialized = true
  }

  /**
   * Get available AI providers
   */
  async getAvailableProviders(): Promise<AIProviderInfo[]> {
    return this.detector.getAvailableProviders()
  }

  /**
   * Get the best available provider
   */
  async getBestProvider(): Promise<AIProvider | null> {
    await this.initializeProviders()

    if (this.config.preferredProvider !== 'auto') {
      const preferred = this.providers.get(this.config.preferredProvider)
      if (preferred && (await preferred.isAvailable())) {
        return preferred
      }
    }

    // Find highest priority available provider
    let bestProvider: AIProvider | null = null
    let highestPriority = -1

    for (const provider of this.providers.values()) {
      if ((await provider.isAvailable()) && provider.priority > highestPriority) {
        bestProvider = provider
        highestPriority = provider.priority
      }
    }

    return bestProvider
  }

  /**
   * Perform AI analysis on package updates
   */
  async analyzeUpdates(
    packages: PackageUpdateInfo[],
    workspaceInfo: WorkspaceInfo,
    options: AnalysisRequestOptions = {}
  ): Promise<AnalysisResult> {
    if (!this.config.enabled) {
      return this.createDisabledResult(packages, options.analysisType ?? 'impact')
    }

    const context: AnalysisContext = {
      packages,
      workspaceInfo,
      analysisType: options.analysisType ?? 'impact',
      options: {
        timeout: options.timeout,
      },
    }

    // Check cache first
    if (this.config.cache.enabled && !options.skipCache) {
      // Try specified provider first, then fallback providers
      const providersToCheck = options.provider
        ? [options.provider]
        : ['claude', 'gemini', 'codex', 'rule-engine']

      for (const providerName of providersToCheck) {
        const cached = this.cache.get(context, providerName)
        if (cached) {
          return {
            ...cached,
            provider: `${cached.provider} (cached)`,
          }
        }
      }
    }

    // Get provider
    await this.initializeProviders()
    let provider: AIProvider | null = null

    if (options.provider) {
      provider = this.providers.get(options.provider) ?? null
    } else {
      provider = await this.getBestProvider()
    }

    // Execute analysis
    let result: AnalysisResult
    let providerUsed: string
    const shouldFetchSecurityData =
      (this.config.securityData?.enabled ?? true) &&
      (provider !== null || context.analysisType === 'security')
    const contextWithSecurity: AnalysisContext = shouldFetchSecurityData
      ? { ...context, securityData: await this.fetchSecurityData(packages) }
      : context

    if (provider) {
      try {
        result = await provider.analyze(contextWithSecurity)
        providerUsed = provider.name
      } catch (error) {
        // Log the error and fallback to rule engine
        logger.warn('AI provider analysis failed, falling back to rule engine', {
          provider: provider.name,
          error: (error as Error).message,
          packages: packages.length,
        })
        if (this.config.fallback.enabled && this.config.fallback.useRuleEngine) {
          result = this.ruleEngine.analyze(contextWithSecurity)
          providerUsed = 'rule-engine'
        } else {
          throw error
        }
      }
    } else {
      // No provider available, use fallback
      if (this.config.fallback.enabled && this.config.fallback.useRuleEngine) {
        result = this.ruleEngine.analyze(contextWithSecurity)
        providerUsed = 'rule-engine'
      } else {
        result = this.createNoProviderResult(packages, context.analysisType)
        providerUsed = 'none'
      }
    }

    // Cache result (including fallback results)
    if (this.config.cache.enabled && providerUsed !== 'none') {
      this.cache.set(context, providerUsed, result)
    }

    return result
  }

  /**
   * Perform impact analysis
   */
  async analyzeImpact(
    packages: PackageUpdateInfo[],
    workspaceInfo: WorkspaceInfo,
    options: Omit<AnalysisRequestOptions, 'analysisType'> = {}
  ): Promise<AnalysisResult> {
    return this.analyzeUpdates(packages, workspaceInfo, {
      ...options,
      analysisType: 'impact',
    })
  }

  /**
   * Perform security analysis
   */
  async analyzeSecurity(
    packages: PackageUpdateInfo[],
    workspaceInfo: WorkspaceInfo,
    options: Omit<AnalysisRequestOptions, 'analysisType'> = {}
  ): Promise<AnalysisResult> {
    return this.analyzeUpdates(packages, workspaceInfo, {
      ...options,
      analysisType: 'security',
    })
  }

  /**
   * Perform compatibility analysis
   */
  async analyzeCompatibility(
    packages: PackageUpdateInfo[],
    workspaceInfo: WorkspaceInfo,
    options: Omit<AnalysisRequestOptions, 'analysisType'> = {}
  ): Promise<AnalysisResult> {
    return this.analyzeUpdates(packages, workspaceInfo, {
      ...options,
      analysisType: 'compatibility',
    })
  }

  /**
   * Get smart recommendations
   */
  async getRecommendations(
    packages: PackageUpdateInfo[],
    workspaceInfo: WorkspaceInfo,
    options: Omit<AnalysisRequestOptions, 'analysisType'> = {}
  ): Promise<AnalysisResult> {
    return this.analyzeUpdates(packages, workspaceInfo, {
      ...options,
      analysisType: 'recommend',
    })
  }

  /**
   * Perform comprehensive analysis (all types)
   * PERF-004: Parallelized analysis execution for all types
   */
  async analyzeComprehensive(
    packages: PackageUpdateInfo[],
    workspaceInfo: WorkspaceInfo,
    options: Omit<AnalysisRequestOptions, 'analysisType'> = {}
  ): Promise<MultiAnalysisResult> {
    // PERF-004: Run all analysis types in parallel
    const results = await Promise.all(
      this.config.analysisTypes.map((analysisType) =>
        this.analyzeUpdates(packages, workspaceInfo, {
          ...options,
          analysisType,
        })
      )
    )

    // Collect unique providers
    const providers = [...new Set(results.map((r) => r.provider))]

    // Merge results
    const merged = this.mergeResults(results)

    return {
      primary: results[0]!,
      secondary: results[1],
      merged,
      providers,
      timestamp: new Date(),
    }
  }

  /**
   * Merge multiple analysis results
   */
  private mergeResults(results: AnalysisResult[]): AnalysisResult {
    if (results.length === 0) {
      throw new AIAnalysisError('merge', 'No results to merge')
    }

    if (results.length === 1) {
      return results[0]!
    }

    const recommendations = this.mergeRecommendations(results)
    const avgConfidence = this.calculateAverageConfidence(results)
    const warnings = this.collectUniqueWarnings(results)
    const totalProcessingTime = this.calculateTotalProcessingTime(results)

    return {
      provider: results.map((r) => r.provider).join(', '),
      analysisType: 'recommend',
      recommendations,
      summary: `Comprehensive analysis from ${results.length} analysis types`,
      confidence: avgConfidence,
      warnings,
      timestamp: new Date(),
      processingTimeMs: totalProcessingTime,
    }
  }

  /**
   * Merge recommendations from multiple results by package.
   * Extracted from mergeResults for better readability.
   */
  private mergeRecommendations(results: AnalysisResult[]): Recommendation[] {
    const recommendationMap = new Map<string, Recommendation>()

    for (const result of results) {
      for (const rec of result.recommendations) {
        const existing = recommendationMap.get(rec.package)

        if (!existing) {
          recommendationMap.set(rec.package, { ...rec })
        } else {
          recommendationMap.set(rec.package, this.mergeRecommendation(existing, rec))
        }
      }
    }

    return Array.from(recommendationMap.values())
  }

  /**
   * Merge two recommendations for the same package
   * Takes higher risk level, more conservative action, combines reasons and arrays
   */
  private mergeRecommendation(existing: Recommendation, incoming: Recommendation): Recommendation {
    return {
      ...existing,
      riskLevel: this.higherRisk(existing.riskLevel, incoming.riskLevel),
      action: this.moreConservativeAction(existing.action, incoming.action),
      reason: `${existing.reason}; ${incoming.reason}`,
      breakingChanges: this.dedupeArray([
        ...(existing.breakingChanges || []),
        ...(incoming.breakingChanges || []),
      ]),
      securityFixes: this.dedupeArray([
        ...(existing.securityFixes || []),
        ...(incoming.securityFixes || []),
      ]),
    }
  }

  /**
   * Calculate average confidence from results
   */
  private calculateAverageConfidence(results: AnalysisResult[]): number {
    return results.reduce((sum, r) => sum + r.confidence, 0) / results.length
  }

  /**
   * Collect unique warnings from all results
   */
  private collectUniqueWarnings(results: AnalysisResult[]): string[] {
    const allWarnings = results.flatMap((r) => r.warnings || [])
    return this.dedupeArray(allWarnings)
  }

  /**
   * Calculate total processing time from all results
   */
  private calculateTotalProcessingTime(results: AnalysisResult[]): number {
    return results.reduce((sum, r) => sum + (r.processingTimeMs || 0), 0)
  }

  /**
   * Remove duplicates from an array.
   * Optimized from O(n²) to O(n) using Set.
   */
  private dedupeArray<T>(arr: T[]): T[] {
    return [...new Set(arr)]
  }

  /**
   * Get higher risk level
   */
  private higherRisk(
    a: Recommendation['riskLevel'],
    b: Recommendation['riskLevel']
  ): Recommendation['riskLevel'] {
    const riskOrder: Recommendation['riskLevel'][] = ['low', 'medium', 'high', 'critical']
    const aIndex = riskOrder.indexOf(a)
    const bIndex = riskOrder.indexOf(b)
    return aIndex >= bIndex ? a : b
  }

  /**
   * Get more conservative action
   */
  private moreConservativeAction(
    a: Recommendation['action'],
    b: Recommendation['action']
  ): Recommendation['action'] {
    const actionOrder: Recommendation['action'][] = ['update', 'defer', 'review', 'skip']
    const aIndex = actionOrder.indexOf(a)
    const bIndex = actionOrder.indexOf(b)
    return aIndex >= bIndex ? a : b
  }

  /**
   * Create result for disabled AI
   */
  private createDisabledResult(
    packages: PackageUpdateInfo[],
    analysisType: AnalysisType
  ): AnalysisResult {
    return {
      provider: 'none',
      analysisType,
      recommendations: packages.map((pkg) => ({
        package: pkg.name,
        currentVersion: pkg.currentVersion,
        targetVersion: pkg.targetVersion,
        action: 'review' as const,
        reason: 'AI analysis is disabled',
        riskLevel: 'medium' as const,
      })),
      summary: 'AI analysis is disabled. All updates require manual review.',
      confidence: 0,
      warnings: ['AI analysis is disabled in configuration'],
      timestamp: new Date(),
    }
  }

  /**
   * Create result when no provider is available
   */
  private createNoProviderResult(
    packages: PackageUpdateInfo[],
    analysisType: AnalysisType
  ): AnalysisResult {
    return {
      provider: 'none',
      analysisType,
      recommendations: packages.map((pkg) => ({
        package: pkg.name,
        currentVersion: pkg.currentVersion,
        targetVersion: pkg.targetVersion,
        action: 'review' as const,
        reason: 'No AI provider available',
        riskLevel: 'medium' as const,
      })),
      summary: 'No AI provider available. Manual review recommended.',
      confidence: 0,
      warnings: [
        'No AI CLI tools detected. Install Claude, Gemini, or Codex for AI-powered analysis.',
      ],
      timestamp: new Date(),
    }
  }

  /**
   * Default chunking configuration
   */
  private readonly defaultChunkingConfig: Required<Omit<ChunkingConfig, 'onProgress'>> = {
    enabled: true,
    chunkSize: 30,
    threshold: 50,
  }

  /**
   * Analyze packages with automatic chunking for large sets
   */
  async analyzeWithChunking(
    packages: PackageUpdateInfo[],
    workspaceInfo: WorkspaceInfo,
    options: AnalysisRequestOptions = {}
  ): Promise<AnalysisResult> {
    const chunkConfig = {
      ...this.defaultChunkingConfig,
      ...options.chunking,
    }

    // Use regular analysis if chunking is disabled or package count is below threshold
    if (!chunkConfig.enabled || packages.length < chunkConfig.threshold) {
      return this.analyzeUpdates(packages, workspaceInfo, options)
    }

    logger.info('Using chunked analysis for large package set', {
      totalPackages: packages.length,
      chunkSize: chunkConfig.chunkSize,
    })

    // Split packages into chunks
    const chunks = this.splitIntoChunks(packages, chunkConfig.chunkSize)
    const chunkResults: AnalysisResult[] = []
    const totalPackages = packages.length

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!
      const processedPackages = i * chunkConfig.chunkSize + chunk.length

      // Report progress
      if (options.chunking?.onProgress) {
        options.chunking.onProgress({
          currentChunk: i + 1,
          totalChunks: chunks.length,
          processedPackages,
          totalPackages,
          percentComplete: Math.round((processedPackages / totalPackages) * 100),
        })
      }

      logger.debug('Processing chunk', {
        chunk: i + 1,
        totalChunks: chunks.length,
        packagesInChunk: chunk.length,
      })

      // Analyze chunk (skip cache for intermediate chunks to avoid partial results)
      const chunkResult = await this.analyzeUpdates(chunk, workspaceInfo, {
        ...options,
        skipCache: true, // Don't cache individual chunks
      })

      chunkResults.push(chunkResult)
    }

    // Merge all chunk results
    const mergedResult = this.mergeChunkResults(chunkResults, packages.length)

    // Cache the final merged result
    if (this.config.cache.enabled && !options.skipCache) {
      const context: AnalysisContext = {
        packages,
        workspaceInfo,
        analysisType: options.analysisType ?? 'impact',
        options: { timeout: options.timeout },
      }
      this.cache.set(context, mergedResult.provider, mergedResult)
    }

    // Final progress report
    if (options.chunking?.onProgress) {
      options.chunking.onProgress({
        currentChunk: chunks.length,
        totalChunks: chunks.length,
        processedPackages: totalPackages,
        totalPackages,
        percentComplete: 100,
      })
    }

    return mergedResult
  }

  /**
   * Split packages into chunks of specified size
   */
  private splitIntoChunks(packages: PackageUpdateInfo[], chunkSize: number): PackageUpdateInfo[][] {
    const chunks: PackageUpdateInfo[][] = []

    for (let i = 0; i < packages.length; i += chunkSize) {
      chunks.push(packages.slice(i, i + chunkSize))
    }

    return chunks
  }

  /**
   * Merge results from multiple chunks
   */
  private mergeChunkResults(results: AnalysisResult[], totalPackages: number): AnalysisResult {
    if (results.length === 0) {
      throw new AIAnalysisError('merge', 'No chunk results to merge')
    }

    if (results.length === 1) {
      return results[0]!
    }

    // Collect all recommendations
    const allRecommendations: Recommendation[] = []
    const allWarnings: string[] = []
    let totalProcessingTime = 0
    let totalConfidence = 0
    const providers = new Set<string>()

    for (const result of results) {
      allRecommendations.push(...result.recommendations)
      if (result.warnings) {
        allWarnings.push(...result.warnings)
      }
      totalProcessingTime += result.processingTimeMs ?? 0
      totalConfidence += result.confidence
      providers.add(result.provider.replace(' (cached)', ''))
    }

    const avgConfidence = totalConfidence / results.length
    const providerList = Array.from(providers).join(', ')

    return {
      provider: providerList,
      analysisType: results[0]!.analysisType,
      recommendations: allRecommendations,
      summary: `Chunked analysis completed: ${totalPackages} packages analyzed in ${results.length} chunks`,
      confidence: avgConfidence,
      warnings: this.dedupeArray(allWarnings), // Use O(n) deduplication
      timestamp: new Date(),
      processingTimeMs: totalProcessingTime,
    }
  }

  /**
   * Invalidate cache for specific packages
   */
  invalidateCache(packageNames: string[]): void {
    this.cache.invalidateForPackages(packageNames)
  }

  /**
   * Clear all cached analysis results
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats()
  }

  /**
   * Fetch real-time security vulnerability data for packages
   */
  private async fetchSecurityData(
    packages: PackageUpdateInfo[]
  ): Promise<Map<string, SecurityVulnerabilityData>> {
    const securityData = new Map<string, SecurityVulnerabilityData>()

    try {
      // Query security data for target versions
      const packagesToQuery = packages.map((pkg) => ({
        name: pkg.name,
        version: pkg.targetVersion,
      }))

      const reports = await this.securityService.queryMultiplePackages(packagesToQuery)

      // Convert SecurityAdvisoryReport to SecurityVulnerabilityData
      for (const [key, report] of reports) {
        // If version has critical/high vulnerabilities, find a safe version
        let safeVersion:
          | {
              version: string
              sameMajor: boolean
              sameMinor: boolean
              versionsChecked: number
              skippedVersions?: Array<{
                version: string
                vulnerabilities: Array<{
                  id: string
                  severity: string
                  summary: string
                }>
              }>
            }
          | undefined
        if (report.hasCriticalVulnerabilities || report.hasHighVulnerabilities) {
          const foundSafeVersion = await this.securityService.findSafeVersion(
            report.packageName,
            report.version
          )
          if (foundSafeVersion) {
            safeVersion = foundSafeVersion
          }
        }

        securityData.set(key, {
          packageName: report.packageName,
          version: report.version,
          vulnerabilities: report.vulnerabilities.map((v) => ({
            id: v.id,
            aliases: v.aliases,
            summary: v.summary,
            severity: v.severity,
            cvssScore: v.cvssScore,
            fixedVersions: v.fixedVersions,
          })),
          hasCriticalVulnerabilities: report.hasCriticalVulnerabilities,
          hasHighVulnerabilities: report.hasHighVulnerabilities,
          totalVulnerabilities: report.totalVulnerabilities,
          safeVersion,
        })
      }
    } catch (error) {
      // Log error but don't fail the analysis - security data is supplementary
      logger.warn('Failed to fetch security data, continuing without it', {
        error: (error as Error).message,
        packages: packages.length,
      })
    }

    return securityData
  }

  /**
   * Check if AI analysis is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config.enabled) {
      return false
    }

    await this.initializeProviders()
    const provider = await this.getBestProvider()

    return provider !== null || this.config.fallback.useRuleEngine
  }

  /**
   * Get service status summary
   */
  async getStatus(): Promise<{
    enabled: boolean
    providers: AIProviderInfo[]
    activeProvider: string | null
    cacheEnabled: boolean
    cacheStats: ReturnType<AnalysisCache['getStats']>
    fallbackEnabled: boolean
  }> {
    await this.initializeProviders()
    const providers = await this.getAvailableProviders()
    const bestProvider = await this.getBestProvider()

    return {
      enabled: this.config.enabled,
      providers,
      activeProvider: bestProvider?.name ?? null,
      cacheEnabled: this.config.cache.enabled,
      cacheStats: this.cache.getStats(),
      fallbackEnabled: this.config.fallback.enabled,
    }
  }
}
