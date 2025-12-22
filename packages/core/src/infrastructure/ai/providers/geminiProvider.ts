/**
 * Gemini AI Provider
 *
 * Implementation of AI provider using Gemini CLI.
 * Supports all analysis types with Google's AI capabilities.
 */

import { exec as execCallback } from 'node:child_process'
import { promisify } from 'node:util'

import type {
  AIProviderInfo,
  AnalysisContext,
  AnalysisResult,
  AnalysisType,
} from '../../../domain/interfaces/aiProvider.js'
import { BaseAIProvider, type BaseProviderOptions } from './baseProvider.js'

const exec = promisify(execCallback)

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
 */
export class GeminiProvider extends BaseAIProvider {
  readonly name = 'gemini'
  readonly priority = 80
  readonly capabilities: AnalysisType[] = ['impact', 'security', 'compatibility', 'recommend']

  private readonly model: string
  private readonly maxTokens: number
  private readonly sandbox: boolean
  private cachedAvailability: boolean | null = null
  private cachedInfo: AIProviderInfo | null = null

  constructor(options: GeminiProviderOptions = {}) {
    super(options)
    this.model = options.model ?? 'gemini-2.5-pro'
    this.maxTokens = options.maxTokens ?? 4096
    this.sandbox = options.sandbox ?? true
  }

  /**
   * Check if Gemini CLI is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.cachedAvailability !== null) {
      return this.cachedAvailability
    }

    try {
      // Try to run gemini --version
      await exec('gemini --version', { timeout: 1500 })
      this.cachedAvailability = true
      return true
    } catch {
      try {
        // Fast PATH lookup (non-interactive, avoids hanging on shell rc files)
        const { stdout } = await exec('command -v gemini 2>/dev/null', { timeout: 500 })
        const isAvailable = stdout.trim().length > 0
        this.cachedAvailability = isAvailable
        return isAvailable
      } catch {
        // Check for alternative command names
        try {
          const { stdout } = await exec('command -v gemini-cli 2>/dev/null', { timeout: 500 })
          if (!stdout.trim()) {
            throw new Error('gemini-cli not found')
          }
          this.cachedAvailability = true
          return true
        } catch {
          this.cachedAvailability = false
          return false
        }
      }
    }
  }

  /**
   * Get Gemini provider information
   */
  async getInfo(): Promise<AIProviderInfo> {
    if (this.cachedInfo) {
      return this.cachedInfo
    }

    const available = await this.isAvailable()
    let version: string | undefined
    let path: string | undefined

    if (available) {
      try {
        const { stdout } = await exec('gemini --version', { timeout: 1500 })
        version = stdout.trim()
      } catch {
        // Version not available
      }

      try {
        const { stdout } = await exec('command -v gemini', { timeout: 500 })
        path = stdout.trim()
      } catch {
        path = 'alias'
      }
    }

    const info: AIProviderInfo = {
      name: this.name,
      version,
      path,
      available,
      priority: available ? this.priority : 0,
      capabilities: this.capabilities,
    }
    this.cachedInfo = info

    return info
  }

  /**
   * Perform analysis using Gemini CLI
   */
  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now()

    // Check availability first
    if (!(await this.isAvailable())) {
      throw new Error('Gemini CLI is not available')
    }

    // Build the prompt
    const prompt = this.buildPrompt(context)

    // Execute Gemini CLI
    try {
      const { stdout, stderr } = await this.executeGeminiCommand(prompt)

      // Parse the response
      const result = this.parseResponse(stdout || stderr, context)
      result.processingTimeMs = Date.now() - startTime

      return result
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
          reason: `Gemini analysis failed: ${(error as Error).message}`,
          riskLevel: 'medium' as const,
        })),
        summary: 'Analysis failed, manual review recommended',
        confidence: 0.1,
        warnings: [`Gemini CLI error: ${(error as Error).message}`],
        timestamp: new Date(),
        processingTimeMs: Date.now() - startTime,
      }
    }
  }

  /**
   * Execute Gemini CLI command
   */
  private async executeGeminiCommand(prompt: string): Promise<{ stdout: string; stderr: string }> {
    // Escape the prompt for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''")

    // Build command with appropriate flags
    // Gemini CLI typically uses: gemini -p "prompt" or gemini --prompt "prompt"
    const args: string[] = []

    if (this.sandbox) {
      args.push('--sandbox')
    }

    // Add model selection
    if (this.model) {
      args.push('--model', this.model)
    }

    // Add max tokens configuration
    if (this.maxTokens) {
      args.push('--max-output-tokens', String(this.maxTokens))
    }

    // Use -p flag for prompt
    const command = `gemini ${args.join(' ')} -p '${escapedPrompt}'`

    let lastError: Error | null = null

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
        })

        return result
      } catch (error) {
        lastError = error as Error

        // Check if it's a timeout error
        if (
          (error as { killed?: boolean }).killed ||
          (error as Error).message.includes('TIMEOUT')
        ) {
          throw new Error(`Gemini CLI timed out after ${this.timeout}ms`)
        }

        // Retry on other errors
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * 2 ** (attempt - 1))
        }
      }
    }

    throw lastError ?? new Error('Gemini CLI execution failed')
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
