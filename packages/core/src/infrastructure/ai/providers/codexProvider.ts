/**
 * Codex AI Provider
 *
 * Implementation of AI provider using OpenAI Codex CLI.
 * Optimized for code analysis and technical recommendations.
 *
 * QUAL-001: Simplified to use base class functionality
 */

import type { AnalysisContext, AnalysisType } from '../../../domain/interfaces/aiProvider.js'
import { AI_LIMITS, AI_MODELS, AI_PRIORITIES } from '../constants.js'
import { BaseAIProvider, type BaseProviderOptions } from './baseProvider.js'

/**
 * Codex-specific configuration
 */
export interface CodexProviderOptions extends BaseProviderOptions {
  model?: string
  maxTokens?: number
  approvalMode?: 'full-auto' | 'suggest' | 'auto-edit'
}

/**
 * Codex AI Provider
 *
 * QUAL-001: Uses base class for common functionality (isAvailable, getInfo,
 * analyze, clearCache, spawn process handling, retry logic)
 */
export class CodexProvider extends BaseAIProvider {
  readonly name = 'codex'
  readonly priority = AI_PRIORITIES.CODEX
  readonly capabilities: AnalysisType[] = ['impact', 'security', 'compatibility', 'recommend']

  private readonly model: string
  private readonly maxTokens: number
  private readonly approvalMode: string

  constructor(options: CodexProviderOptions = {}) {
    super(options)
    this.model = options.model ?? AI_MODELS.CODEX_DEFAULT
    this.maxTokens = options.maxTokens ?? AI_LIMITS.DEFAULT_MAX_TOKENS
    this.approvalMode = options.approvalMode ?? 'full-auto'
  }

  /**
   * QUAL-001: Implement abstract method - return CLI command name
   */
  protected getCliCommand(): string {
    return 'codex'
  }

  /**
   * QUAL-001: Override to provide alternate command names
   */
  protected override getAlternateCommands(): string[] {
    return ['openai-codex']
  }

  /**
   * QUAL-001: Implement abstract method - build CLI arguments
   */
  protected buildCliArgs(prompt: string): string[] {
    // Prompt goes first as positional argument for codex
    const args: string[] = [prompt]

    args.push('--approval-mode', this.approvalMode)
    args.push('--quiet')

    if (this.model) {
      args.push('--model', this.model)
    }

    if (this.maxTokens) {
      args.push('--max-tokens', String(this.maxTokens))
    }

    return args
  }

  /**
   * Build a more structured prompt for Codex
   */
  protected override buildPrompt(context: AnalysisContext): string {
    const basePrompt = super.buildPrompt(context)

    // Add Codex-specific instructions optimized for code analysis
    return `${basePrompt}

Code Analysis Guidelines:
- Focus on code-level impact and breaking changes
- Analyze TypeScript/JavaScript compatibility thoroughly
- Check for API signature changes between versions
- Identify deprecated APIs and migration paths
- Consider build tool and bundler compatibility
- Provide specific code migration examples when possible
- Return only valid JSON response`
  }
}
