/**
 * Claude AI Provider
 *
 * Implementation of AI provider using Claude CLI.
 * Supports all analysis types with high-quality reasoning.
 *
 * QUAL-001: Simplified to use base class functionality
 */

import type { AnalysisContext, AnalysisType } from '../../../domain/interfaces/aiProvider.js'
import { AI_MODELS, AI_PRIORITIES } from '../constants.js'
import { BaseAIProvider, type BaseProviderOptions } from './baseProvider.js'

/**
 * Claude-specific configuration
 */
export interface ClaudeProviderOptions extends BaseProviderOptions {
  model?: string
  dangerouslySkipPermissions?: boolean
}

/**
 * Claude AI Provider
 *
 * QUAL-001: Uses base class for common functionality (isAvailable, getInfo,
 * analyze, clearCache, spawn process handling, retry logic)
 */
export class ClaudeProvider extends BaseAIProvider {
  readonly name = 'claude'
  readonly priority = AI_PRIORITIES.CLAUDE
  readonly capabilities: AnalysisType[] = ['impact', 'security', 'compatibility', 'recommend']

  private readonly model: string
  private readonly dangerouslySkipPermissions: boolean

  constructor(options: ClaudeProviderOptions = {}) {
    super(options)
    this.model = options.model ?? AI_MODELS.CLAUDE_DEFAULT
    this.dangerouslySkipPermissions = options.dangerouslySkipPermissions ?? true
  }

  /**
   * QUAL-001: Implement abstract method - return CLI command name
   */
  protected getCliCommand(): string {
    return 'claude'
  }

  /**
   * QUAL-001: Implement abstract method - build CLI arguments
   */
  protected buildCliArgs(prompt: string): string[] {
    const args: string[] = []

    if (this.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions')
    }

    if (this.model) {
      args.push('--model', this.model)
    }

    // Add output format and print mode
    args.push('--output-format', 'text', '-p')

    // Prompt goes last as positional argument
    args.push(prompt)

    return args
  }

  /**
   * Build a more structured prompt for Claude
   */
  protected override buildPrompt(context: AnalysisContext): string {
    const basePrompt = super.buildPrompt(context)

    // Add Claude-specific instructions
    return `${basePrompt}

Important:
- Be concise and focus on actionable insights
- Provide specific version numbers and package names
- Consider the pnpm catalog context for shared dependency management
- Prioritize breaking changes and security implications
- If unsure, recommend "review" action with explanation`
  }
}
