/**
 * AI Analysis Service
 *
 * Core application service that orchestrates AI-powered dependency analysis.
 * Handles provider selection, caching, fallback strategies, and result aggregation.
 */

import type {
  AIConfig,
  AIProvider,
  AIProviderInfo,
  AnalysisContext,
  AnalysisResult,
  AnalysisType,
  PackageUpdateInfo,
  Recommendation,
  WorkspaceInfo,
} from '../../domain/interfaces/aiProvider.js';
import { AIDetector } from '../../infrastructure/ai/aiDetector.js';
import { AnalysisCache, analysisCache } from '../../infrastructure/ai/cache/analysisCache.js';
import { RuleEngine } from '../../infrastructure/ai/fallback/ruleEngine.js';
import { ClaudeProvider } from '../../infrastructure/ai/providers/claudeProvider.js';
import { CodexProvider } from '../../infrastructure/ai/providers/codexProvider.js';
import { GeminiProvider } from '../../infrastructure/ai/providers/geminiProvider.js';

/**
 * Service options
 */
export interface AIAnalysisServiceOptions {
  config?: Partial<AIConfig>;
  cache?: AnalysisCache;
  detector?: AIDetector;
}

/**
 * Analysis request options
 */
export interface AnalysisRequestOptions {
  analysisType?: AnalysisType;
  provider?: string; // Specific provider to use
  skipCache?: boolean;
  timeout?: number;
}

/**
 * Multi-provider analysis result
 */
export interface MultiAnalysisResult {
  primary: AnalysisResult;
  secondary?: AnalysisResult;
  merged?: AnalysisResult;
  providers: string[];
  timestamp: Date;
}

/**
 * AI Analysis Service
 *
 * Provides high-level API for AI-powered dependency analysis.
 */
export class AIAnalysisService {
  private readonly config: AIConfig;
  private readonly cache: AnalysisCache;
  private readonly detector: AIDetector;
  private readonly ruleEngine: RuleEngine;
  private readonly providers: Map<string, AIProvider> = new Map();
  private providersInitialized = false;

  constructor(options: AIAnalysisServiceOptions = {}) {
    this.config = this.buildConfig(options.config);
    this.cache = options.cache ?? analysisCache;
    this.detector = options.detector ?? new AIDetector();
    this.ruleEngine = new RuleEngine();
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
    };
  }

  /**
   * Initialize providers (lazy initialization)
   */
  private async initializeProviders(): Promise<void> {
    if (this.providersInitialized) {
      return;
    }

    // Initialize Claude provider (priority: 100)
    const claudeProvider = new ClaudeProvider(this.config.providers.claude);
    if (await claudeProvider.isAvailable()) {
      this.providers.set('claude', claudeProvider);
    }

    // Initialize Gemini provider (priority: 80)
    const geminiProvider = new GeminiProvider(this.config.providers.gemini);
    if (await geminiProvider.isAvailable()) {
      this.providers.set('gemini', geminiProvider);
    }

    // Initialize Codex provider (priority: 60)
    const codexProvider = new CodexProvider(this.config.providers.codex);
    if (await codexProvider.isAvailable()) {
      this.providers.set('codex', codexProvider);
    }

    // Future: Initialize additional providers
    // const cursorProvider = new CursorProvider(this.config.providers.cursor);
    // const aiderProvider = new AiderProvider(this.config.providers.aider);

    this.providersInitialized = true;
  }

  /**
   * Get available AI providers
   */
  async getAvailableProviders(): Promise<AIProviderInfo[]> {
    return this.detector.getAvailableProviders();
  }

  /**
   * Get the best available provider
   */
  async getBestProvider(): Promise<AIProvider | null> {
    await this.initializeProviders();

    if (this.config.preferredProvider !== 'auto') {
      const preferred = this.providers.get(this.config.preferredProvider);
      if (preferred && (await preferred.isAvailable())) {
        return preferred;
      }
    }

    // Find highest priority available provider
    let bestProvider: AIProvider | null = null;
    let highestPriority = -1;

    for (const provider of this.providers.values()) {
      if ((await provider.isAvailable()) && provider.priority > highestPriority) {
        bestProvider = provider;
        highestPriority = provider.priority;
      }
    }

    return bestProvider;
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
      return this.createDisabledResult(packages, options.analysisType ?? 'impact');
    }

    const context: AnalysisContext = {
      packages,
      workspaceInfo,
      analysisType: options.analysisType ?? 'impact',
      options: {
        timeout: options.timeout,
      },
    };

    // Check cache first
    if (this.config.cache.enabled && !options.skipCache) {
      // Try specified provider first, then fallback providers
      const providersToCheck = options.provider
        ? [options.provider]
        : ['claude', 'gemini', 'codex', 'rule-engine'];

      for (const providerName of providersToCheck) {
        const cached = this.cache.get(context, providerName);
        if (cached) {
          return {
            ...cached,
            provider: `${cached.provider} (cached)`,
          };
        }
      }
    }

    // Get provider
    await this.initializeProviders();
    let provider: AIProvider | null = null;

    if (options.provider) {
      provider = this.providers.get(options.provider) ?? null;
    } else {
      provider = await this.getBestProvider();
    }

    // Execute analysis
    let result: AnalysisResult;
    let providerUsed: string;

    if (provider) {
      try {
        result = await provider.analyze(context);
        providerUsed = provider.name;
      } catch (error) {
        // Fallback on provider error
        if (this.config.fallback.enabled && this.config.fallback.useRuleEngine) {
          result = this.ruleEngine.analyze(context);
          providerUsed = 'rule-engine';
          result.warnings = [
            ...(result.warnings || []),
            `AI provider error, using rule-based fallback: ${(error as Error).message}`,
          ];
        } else {
          throw error;
        }
      }
    } else {
      // No provider available, use fallback
      if (this.config.fallback.enabled && this.config.fallback.useRuleEngine) {
        result = this.ruleEngine.analyze(context);
        providerUsed = 'rule-engine';
      } else {
        result = this.createNoProviderResult(packages, context.analysisType);
        providerUsed = 'none';
      }
    }

    // Cache result (including fallback results)
    if (this.config.cache.enabled && providerUsed !== 'none') {
      this.cache.set(context, providerUsed, result);
    }

    return result;
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
    });
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
    });
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
    });
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
    });
  }

  /**
   * Perform comprehensive analysis (all types)
   */
  async analyzeComprehensive(
    packages: PackageUpdateInfo[],
    workspaceInfo: WorkspaceInfo,
    options: Omit<AnalysisRequestOptions, 'analysisType'> = {}
  ): Promise<MultiAnalysisResult> {
    const results: AnalysisResult[] = [];
    const providers: string[] = [];

    // Run all analysis types
    for (const analysisType of this.config.analysisTypes) {
      const result = await this.analyzeUpdates(packages, workspaceInfo, {
        ...options,
        analysisType,
      });
      results.push(result);
      if (!providers.includes(result.provider)) {
        providers.push(result.provider);
      }
    }

    // Merge results
    const merged = this.mergeResults(results);

    return {
      primary: results[0]!,
      secondary: results[1],
      merged,
      providers,
      timestamp: new Date(),
    };
  }

  /**
   * Merge multiple analysis results
   */
  private mergeResults(results: AnalysisResult[]): AnalysisResult {
    if (results.length === 0) {
      throw new Error('No results to merge');
    }

    if (results.length === 1) {
      return results[0]!;
    }

    // Merge recommendations by package
    const recommendationMap = new Map<string, Recommendation>();

    for (const result of results) {
      for (const rec of result.recommendations) {
        const existing = recommendationMap.get(rec.package);

        if (!existing) {
          recommendationMap.set(rec.package, { ...rec });
        } else {
          // Merge: take higher risk level, combine reasons
          const mergedRec: Recommendation = {
            ...existing,
            riskLevel: this.higherRisk(existing.riskLevel, rec.riskLevel),
            action: this.moreConservativeAction(existing.action, rec.action),
            reason: `${existing.reason}; ${rec.reason}`,
            breakingChanges: [
              ...(existing.breakingChanges || []),
              ...(rec.breakingChanges || []),
            ].filter((v, i, a) => a.indexOf(v) === i),
            securityFixes: [...(existing.securityFixes || []), ...(rec.securityFixes || [])].filter(
              (v, i, a) => a.indexOf(v) === i
            ),
          };
          recommendationMap.set(rec.package, mergedRec);
        }
      }
    }

    // Calculate average confidence
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

    // Collect all warnings
    const allWarnings = results.flatMap((r) => r.warnings || []);

    // Total processing time
    const totalProcessingTime = results.reduce((sum, r) => sum + (r.processingTimeMs || 0), 0);

    return {
      provider: results.map((r) => r.provider).join(', '),
      analysisType: 'recommend', // Merged analysis is essentially recommendations
      recommendations: Array.from(recommendationMap.values()),
      summary: `Comprehensive analysis from ${results.length} analysis types`,
      confidence: avgConfidence,
      warnings: allWarnings.filter((v, i, a) => a.indexOf(v) === i),
      timestamp: new Date(),
      processingTimeMs: totalProcessingTime,
    };
  }

  /**
   * Get higher risk level
   */
  private higherRisk(
    a: Recommendation['riskLevel'],
    b: Recommendation['riskLevel']
  ): Recommendation['riskLevel'] {
    const riskOrder: Recommendation['riskLevel'][] = ['low', 'medium', 'high', 'critical'];
    const aIndex = riskOrder.indexOf(a);
    const bIndex = riskOrder.indexOf(b);
    return aIndex >= bIndex ? a : b;
  }

  /**
   * Get more conservative action
   */
  private moreConservativeAction(
    a: Recommendation['action'],
    b: Recommendation['action']
  ): Recommendation['action'] {
    const actionOrder: Recommendation['action'][] = ['update', 'defer', 'review', 'skip'];
    const aIndex = actionOrder.indexOf(a);
    const bIndex = actionOrder.indexOf(b);
    return aIndex >= bIndex ? a : b;
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
    };
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
    };
  }

  /**
   * Invalidate cache for specific packages
   */
  invalidateCache(packageNames: string[]): void {
    this.cache.invalidateForPackages(packageNames);
  }

  /**
   * Clear all cached analysis results
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Check if AI analysis is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    await this.initializeProviders();
    const provider = await this.getBestProvider();

    return provider !== null || this.config.fallback.useRuleEngine;
  }

  /**
   * Get service status summary
   */
  async getStatus(): Promise<{
    enabled: boolean;
    providers: AIProviderInfo[];
    activeProvider: string | null;
    cacheEnabled: boolean;
    cacheStats: ReturnType<AnalysisCache['getStats']>;
    fallbackEnabled: boolean;
  }> {
    await this.initializeProviders();
    const providers = await this.getAvailableProviders();
    const bestProvider = await this.getBestProvider();

    return {
      enabled: this.config.enabled,
      providers,
      activeProvider: bestProvider?.name ?? null,
      cacheEnabled: this.config.cache.enabled,
      cacheStats: this.cache.getStats(),
      fallbackEnabled: this.config.fallback.enabled,
    };
  }
}
