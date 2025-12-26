/**
 * Gemini AI Provider
 *
 * Implementation of AI provider using Gemini CLI.
 * Supports all analysis types with Google's AI capabilities.
 *
 * QUAL-001: Simplified to use base class functionality
 */

import type { AnalysisContext, AnalysisType } from '../../../domain/interfaces/aiProvider.js'
import { AI_LIMITS, AI_MODELS, AI_PRIORITIES } from '../constants.js'
import { BaseAIProvider, type BaseProviderOptions } from './baseProvider.js'

/**
 * Gemini-specific configuration
 */
export interface GeminiProviderOptions extends BaseProviderOptions {
  model?: string
  maxTokens?: number
  sandbox?: boolean
}

/**
 * Gemini AI Provider
 *
 * QUAL-001: Uses base class for common functionality (isAvailable, getInfo,
 * analyze, clearCache, spawn process handling, retry logic)
 */
export class GeminiProvider extends BaseAIProvider {
  readonly name = 'gemini'
  readonly priority = AI_PRIORITIES.GEMINI
  readonly capabilities: AnalysisType[] = ['impact', 'security', 'compatibility', 'recommend']

  private readonly model: string
  private readonly maxTokens: number
  private readonly sandbox: boolean

  constructor(options: GeminiProviderOptions = {}) {
    super(options)
    this.model = options.model ?? AI_MODELS.GEMINI_DEFAULT
    this.maxTokens = options.maxTokens ?? AI_LIMITS.DEFAULT_MAX_TOKENS
    this.sandbox = options.sandbox ?? true
  }

  /**
   * QUAL-001: Implement abstract method - return CLI command name
   */
  protected getCliCommand(): string {
    return 'gemini'
  }

  /**
   * QUAL-001: Override to provide alternate command names
   */
  protected override getAlternateCommands(): string[] {
    return ['gemini-cli']
  }

  /**
   * QUAL-001: Implement abstract method - build CLI arguments
   */
  protected buildCliArgs(prompt: string): string[] {
    const args: string[] = []

    if (this.sandbox) {
      args.push('--sandbox')
    }

    if (this.model) {
      args.push('--model', this.model)
    }

    if (this.maxTokens) {
      args.push('--max-output-tokens', String(this.maxTokens))
    }

    // Add prompt at the end with -p flag
    args.push('-p', prompt)

    return args
  }

  /**
   * Build a more structured prompt for Gemini
   */
  protected override buildPrompt(context: AnalysisContext): string {
    const basePrompt = super.buildPrompt(context)

    // Add Gemini-specific instructions
    return `${basePrompt}

Instructions:
- Provide comprehensive analysis with clear reasoning
- Focus on practical impact and migration guidance
- Consider the pnpm workspace catalog context
- Be precise about version compatibility
- Highlight any Google/GCP related package interactions if applicable
- Return valid JSON format only`
  }
}
