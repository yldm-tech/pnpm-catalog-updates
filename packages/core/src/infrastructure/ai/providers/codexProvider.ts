/**
 * Codex AI Provider
 *
 * Implementation of AI provider using OpenAI Codex CLI.
 * Optimized for code analysis and technical recommendations.
 */

import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  AIProviderInfo,
  AnalysisContext,
  AnalysisResult,
  AnalysisType,
} from '../../../domain/interfaces/aiProvider.js';
import { BaseAIProvider, BaseProviderOptions } from './baseProvider.js';

const exec = promisify(execCallback);

/**
 * Codex-specific configuration
 */
export interface CodexProviderOptions extends BaseProviderOptions {
  model?: string;
  maxTokens?: number;
  approvalMode?: 'full-auto' | 'suggest' | 'auto-edit';
}

/**
 * Codex AI Provider
 */
export class CodexProvider extends BaseAIProvider {
  readonly name = 'codex';
  readonly priority = 60;
  readonly capabilities: AnalysisType[] = ['impact', 'security', 'compatibility', 'recommend'];

  private readonly model: string;
  private readonly maxTokens: number;
  private readonly approvalMode: string;
  private cachedAvailability: boolean | null = null;
  private cachedInfo: AIProviderInfo | null = null;

  constructor(options: CodexProviderOptions = {}) {
    super(options);
    this.model = options.model ?? 'o3';
    this.maxTokens = options.maxTokens ?? 4096;
    this.approvalMode = options.approvalMode ?? 'full-auto';
  }

  /**
   * Check if Codex CLI is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.cachedAvailability !== null) {
      return this.cachedAvailability;
    }

    try {
      // Try to run codex --version
      await exec('codex --version', { timeout: 10000 });
      this.cachedAvailability = true;
      return true;
    } catch {
      // Try alternative detection methods
      try {
        // Check if it's an alias or in PATH
        const { stdout } = await exec('bash -i -c "type codex" 2>/dev/null', { timeout: 5000 });
        this.cachedAvailability =
          stdout.includes('alias') || stdout.includes('function') || stdout.includes('/');
        return this.cachedAvailability;
      } catch {
        // Check for alternative command names (openai-codex, etc.)
        try {
          await exec('which openai-codex', { timeout: 5000 });
          this.cachedAvailability = true;
          return true;
        } catch {
          this.cachedAvailability = false;
          return false;
        }
      }
    }
  }

  /**
   * Get Codex provider information
   */
  async getInfo(): Promise<AIProviderInfo> {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    const available = await this.isAvailable();
    let version: string | undefined;
    let path: string | undefined;

    if (available) {
      try {
        const { stdout } = await exec('codex --version', { timeout: 10000 });
        version = stdout.trim();
      } catch {
        // Version not available
      }

      try {
        const { stdout } = await exec('which codex', { timeout: 5000 });
        path = stdout.trim();
      } catch {
        path = 'alias';
      }
    }

    const info: AIProviderInfo = {
      name: this.name,
      version,
      path,
      available,
      priority: available ? this.priority : 0,
      capabilities: this.capabilities,
    };
    this.cachedInfo = info;

    return info;
  }

  /**
   * Perform analysis using Codex CLI
   */
  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();

    // Check availability first
    if (!(await this.isAvailable())) {
      throw new Error('Codex CLI is not available');
    }

    // Build the prompt
    const prompt = this.buildPrompt(context);

    // Execute Codex CLI
    try {
      const { stdout, stderr } = await this.executeCodexCommand(prompt);

      // Parse the response
      const result = this.parseResponse(stdout || stderr, context);
      result.processingTimeMs = Date.now() - startTime;

      return result;
    } catch (error) {
      // Return a degraded result on error
      return {
        provider: this.name,
        analysisType: context.analysisType,
        recommendations: context.packages.map((pkg) => ({
          package: pkg.name,
          currentVersion: pkg.currentVersion,
          targetVersion: pkg.targetVersion,
          action: 'review' as const,
          reason: `Codex analysis failed: ${(error as Error).message}`,
          riskLevel: 'medium' as const,
        })),
        summary: 'Analysis failed, manual review recommended',
        confidence: 0.1,
        warnings: [`Codex CLI error: ${(error as Error).message}`],
        timestamp: new Date(),
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute Codex CLI command
   */
  private async executeCodexCommand(prompt: string): Promise<{ stdout: string; stderr: string }> {
    // Escape the prompt for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // Build command with appropriate flags
    // Codex CLI uses: codex "prompt" --approval-mode full-auto
    const args: string[] = [];

    args.push(`'${escapedPrompt}'`);
    args.push('--approval-mode', this.approvalMode);
    args.push('--quiet');

    // Add model selection
    if (this.model) {
      args.push('--model', this.model);
    }

    // Add max tokens configuration
    if (this.maxTokens) {
      args.push('--max-tokens', String(this.maxTokens));
    }

    const command = `codex ${args.join(' ')}`;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await exec(command, {
          timeout: this.timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          env: {
            ...process.env,
            NO_COLOR: '1',
            FORCE_COLOR: '0',
          },
        });

        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if it's a timeout error
        if ((error as any).killed || (error as Error).message.includes('TIMEOUT')) {
          throw new Error(`Codex CLI timed out after ${this.timeout}ms`);
        }

        // Retry on other errors
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    throw lastError ?? new Error('Codex CLI execution failed');
  }

  /**
   * Build a more structured prompt for Codex
   */
  protected override buildPrompt(context: AnalysisContext): string {
    const basePrompt = super.buildPrompt(context);

    // Add Codex-specific instructions optimized for code analysis
    return `${basePrompt}

Code Analysis Guidelines:
- Focus on code-level impact and breaking changes
- Analyze TypeScript/JavaScript compatibility thoroughly
- Check for API signature changes between versions
- Identify deprecated APIs and migration paths
- Consider build tool and bundler compatibility
- Provide specific code migration examples when possible
- Return only valid JSON response`;
  }
}
