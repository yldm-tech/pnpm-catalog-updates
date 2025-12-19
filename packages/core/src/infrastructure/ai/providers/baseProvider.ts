/**
 * Base AI Provider
 *
 * Abstract base class for all AI providers.
 * Provides common functionality for executing CLI commands and parsing responses.
 */

import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  AIProvider,
  AIProviderConfig,
  AIProviderInfo,
  AnalysisContext,
  AnalysisResult,
  AnalysisType,
  Recommendation,
  RiskLevel,
} from '../../../domain/interfaces/aiProvider.js';

const exec = promisify(execCallback);

/**
 * Base configuration for providers
 */
export interface BaseProviderOptions {
  config?: AIProviderConfig;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Abstract base class for AI providers
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;
  abstract readonly priority: number;
  abstract readonly capabilities: AnalysisType[];

  protected readonly config: AIProviderConfig;
  protected readonly timeout: number;
  protected readonly maxRetries: number;

  constructor(options: BaseProviderOptions = {}) {
    this.config = options.config ?? { enabled: true };
    this.timeout = options.timeout ?? 60000; // 60 seconds default
    this.maxRetries = options.maxRetries ?? 2;
  }

  /**
   * Check if the provider is available
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Get provider information
   */
  abstract getInfo(): Promise<AIProviderInfo>;

  /**
   * Perform analysis
   */
  abstract analyze(context: AnalysisContext): Promise<AnalysisResult>;

  /**
   * Execute a CLI command with timeout and retry
   */
  protected async executeCommand(
    command: string,
    args: string[],
    _input?: string
  ): Promise<{ stdout: string; stderr: string }> {
    const fullCommand = `${command} ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await exec(fullCommand, {
          timeout: this.timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          env: { ...process.env, NO_COLOR: '1' },
        });

        return result;
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          // Exponential backoff
          await this.sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    throw lastError ?? new Error('Command execution failed');
  }

  /**
   * Build the analysis prompt
   */
  protected buildPrompt(context: AnalysisContext): string {
    const { packages, workspaceInfo, analysisType, options: _options } = context;

    const packageList = packages
      .map(
        (p) =>
          `- ${p.name}: ${p.currentVersion} -> ${p.targetVersion} (${p.updateType}${p.catalogName ? `, catalog: ${p.catalogName}` : ''})`
      )
      .join('\n');

    const prompts: Record<AnalysisType, string> = {
      impact: `Analyze the impact of updating these packages in a pnpm workspace:

Workspace: ${workspaceInfo.name}
Packages: ${workspaceInfo.packageCount}
Catalogs: ${workspaceInfo.catalogCount}

Updates to analyze:
${packageList}

For each package, provide:
1. Risk level (low/medium/high/critical)
2. Potential breaking changes
3. Recommended action (update/skip/review/defer)
4. Reason for recommendation
5. Estimated migration effort

Respond in JSON format with this structure:
{
  "summary": "Brief overall summary",
  "recommendations": [
    {
      "package": "package-name",
      "currentVersion": "x.y.z",
      "targetVersion": "a.b.c",
      "action": "update|skip|review|defer",
      "reason": "explanation",
      "riskLevel": "low|medium|high|critical",
      "breakingChanges": ["change1", "change2"],
      "estimatedEffort": "low|medium|high"
    }
  ],
  "warnings": ["warning1", "warning2"]
}`,

      security: `Analyze the security implications of these package updates:

Workspace: ${workspaceInfo.name}

Updates to analyze:
${packageList}

For each package:
1. Check if the update fixes known vulnerabilities
2. Assess if the new version introduces security risks
3. Evaluate the package maintainer reputation
4. Check for suspicious changes

Respond in JSON format with security-focused recommendations.`,

      compatibility: `Analyze the compatibility of these package updates:

Workspace: ${workspaceInfo.name}
Packages in workspace: ${workspaceInfo.packageCount}
Catalogs: ${workspaceInfo.catalogCount}

Updates to analyze:
${packageList}

For each package:
1. Check peer dependency compatibility
2. Identify potential conflicts with other packages
3. Assess API compatibility
4. Check for deprecated features

Respond in JSON format with compatibility-focused recommendations.`,

      recommend: `Provide smart recommendations for updating these packages:

Workspace: ${workspaceInfo.name}
Context: pnpm workspace with catalog-based dependency management

Updates available:
${packageList}

Consider:
1. Update priority based on security, features, and stability
2. Grouping related packages for atomic updates
3. Best practices for the specific package ecosystem
4. Risk vs. benefit analysis

Respond in JSON format with prioritized recommendations.`,
    };

    return prompts[analysisType];
  }

  /**
   * Parse the AI response into structured recommendations
   */
  protected parseResponse(response: string, context: AnalysisContext): AnalysisResult {
    const startTime = Date.now();

    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.createFallbackResult(context, response);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const recommendations: Recommendation[] = (parsed.recommendations || []).map((rec: any) => ({
        package: rec.package || rec.name,
        currentVersion: rec.currentVersion || '',
        targetVersion: rec.targetVersion || '',
        action: this.normalizeAction(rec.action),
        reason: rec.reason || '',
        riskLevel: this.normalizeRiskLevel(rec.riskLevel),
        breakingChanges: rec.breakingChanges || [],
        securityFixes: rec.securityFixes || [],
        estimatedEffort: rec.estimatedEffort || 'medium',
      }));

      return {
        provider: this.name,
        analysisType: context.analysisType,
        recommendations,
        summary: parsed.summary || 'Analysis completed',
        confidence: this.calculateConfidence(recommendations, context.packages.length),
        details: parsed.details,
        warnings: parsed.warnings || [],
        timestamp: new Date(),
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return this.createFallbackResult(context, response);
    }
  }

  /**
   * Create a fallback result when parsing fails
   */
  protected createFallbackResult(context: AnalysisContext, rawResponse: string): AnalysisResult {
    return {
      provider: this.name,
      analysisType: context.analysisType,
      recommendations: context.packages.map((pkg) => ({
        package: pkg.name,
        currentVersion: pkg.currentVersion,
        targetVersion: pkg.targetVersion,
        action: 'review' as const,
        reason: 'Unable to parse AI response, manual review recommended',
        riskLevel: 'medium' as const,
      })),
      summary: 'Analysis completed with parsing issues',
      confidence: 0.3,
      details: rawResponse,
      warnings: ['AI response could not be fully parsed'],
      timestamp: new Date(),
    };
  }

  /**
   * Normalize action string
   */
  private normalizeAction(action: string): Recommendation['action'] {
    const normalized = action?.toLowerCase();
    if (['update', 'skip', 'review', 'defer'].includes(normalized)) {
      return normalized as Recommendation['action'];
    }
    return 'review';
  }

  /**
   * Normalize risk level string
   */
  private normalizeRiskLevel(level: string): RiskLevel {
    const normalized = level?.toLowerCase();
    if (['low', 'medium', 'high', 'critical'].includes(normalized)) {
      return normalized as RiskLevel;
    }
    return 'medium';
  }

  /**
   * Calculate confidence score based on response quality
   */
  private calculateConfidence(recommendations: Recommendation[], expectedCount: number): number {
    if (recommendations.length === 0) return 0;

    let score = 0;

    // Coverage: how many packages have recommendations
    score += (recommendations.length / expectedCount) * 0.3;

    // Completeness: how complete each recommendation is
    const completenessSum = recommendations.reduce((sum, rec) => {
      let complete = 0;
      if (rec.package) complete += 0.2;
      if (rec.action) complete += 0.2;
      if (rec.reason && rec.reason.length > 10) complete += 0.3;
      if (rec.riskLevel) complete += 0.15;
      if (rec.breakingChanges && rec.breakingChanges.length > 0) complete += 0.15;
      return sum + complete;
    }, 0);
    score += (completenessSum / recommendations.length) * 0.7;

    return Math.min(score, 1);
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
