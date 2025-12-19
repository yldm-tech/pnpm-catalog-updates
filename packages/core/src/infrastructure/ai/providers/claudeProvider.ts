/**
 * Claude AI Provider
 *
 * Implementation of AI provider using Claude CLI.
 * Supports all analysis types with high-quality reasoning.
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
 * Claude-specific configuration
 */
export interface ClaudeProviderOptions extends BaseProviderOptions {
  model?: string;
  maxTokens?: number;
  dangerouslySkipPermissions?: boolean;
}

/**
 * Claude AI Provider
 */
export class ClaudeProvider extends BaseAIProvider {
  readonly name = 'claude';
  readonly priority = 100;
  readonly capabilities: AnalysisType[] = ['impact', 'security', 'compatibility', 'recommend'];

  private readonly model: string;
  private readonly maxTokens: number;
  private readonly dangerouslySkipPermissions: boolean;
  private cachedAvailability: boolean | null = null;
  private cachedInfo: AIProviderInfo | null = null;

  constructor(options: ClaudeProviderOptions = {}) {
    super(options);
    this.model = options.model ?? 'claude-sonnet-4-20250514';
    this.maxTokens = options.maxTokens ?? 4096;
    this.dangerouslySkipPermissions = options.dangerouslySkipPermissions ?? true;
  }

  /**
   * Check if Claude CLI is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.cachedAvailability !== null) {
      return this.cachedAvailability;
    }

    try {
      // Try to run claude --version
      await exec('claude --version', { timeout: 10000 });
      this.cachedAvailability = true;
      return true;
    } catch {
      // Try alternative detection methods
      try {
        // Check if it's an alias
        const { stdout } = await exec('bash -i -c "type claude" 2>/dev/null', { timeout: 5000 });
        this.cachedAvailability = stdout.includes('alias') || stdout.includes('function');
        return this.cachedAvailability;
      } catch {
        this.cachedAvailability = false;
        return false;
      }
    }
  }

  /**
   * Get Claude provider information
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
        const { stdout } = await exec('claude --version', { timeout: 10000 });
        version = stdout.trim();
      } catch {
        // Version not available
      }

      try {
        const { stdout } = await exec('which claude', { timeout: 5000 });
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
   * Perform analysis using Claude CLI
   */
  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();

    // Check availability first
    if (!(await this.isAvailable())) {
      throw new Error('Claude CLI is not available');
    }

    // Build the prompt
    const prompt = this.buildPrompt(context);

    // Build the command with model and token configuration
    const args: string[] = ['-p', prompt, '--output-format', 'text'];

    // Add model selection if specified
    if (this.model) {
      args.push('--model', this.model);
    }

    // Add max tokens if supported (Claude CLI may use --max-tokens)
    if (this.maxTokens) {
      args.push('--max-tokens', String(this.maxTokens));
    }

    if (this.dangerouslySkipPermissions) {
      args.unshift('--dangerously-skip-permissions');
    }

    // Execute Claude CLI
    try {
      const { stdout, stderr } = await this.executeClaudeCommand(args);

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
          reason: `Claude analysis failed: ${(error as Error).message}`,
          riskLevel: 'medium' as const,
        })),
        summary: 'Analysis failed, manual review recommended',
        confidence: 0.1,
        warnings: [`Claude CLI error: ${(error as Error).message}`],
        timestamp: new Date(),
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute Claude CLI command
   */
  private async executeClaudeCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
    // Escape arguments properly
    const escapedArgs = args.map((arg) => {
      // If the argument contains special characters, wrap in single quotes
      if (arg.includes('"') || arg.includes("'") || arg.includes('\n') || arg.includes(' ')) {
        // For -p flag, we need to handle the prompt specially
        return `'${arg.replace(/'/g, "'\\''")}'`;
      }
      return arg;
    });

    const command = `claude ${escapedArgs.join(' ')}`;

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
          throw new Error(`Claude CLI timed out after ${this.timeout}ms`);
        }

        // Retry on other errors
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    throw lastError ?? new Error('Claude CLI execution failed');
  }

  /**
   * Build a more structured prompt for Claude
   */
  protected override buildPrompt(context: AnalysisContext): string {
    const basePrompt = super.buildPrompt(context);

    // Add Claude-specific instructions
    return `${basePrompt}

Important:
- Be concise and focus on actionable insights
- Provide specific version numbers and package names
- Consider the pnpm catalog context for shared dependency management
- Prioritize breaking changes and security implications
- If unsure, recommend "review" action with explanation`;
  }
}
