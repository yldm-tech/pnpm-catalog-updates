/**
 * Codex AI Provider
 *
 * Implementation of AI provider using OpenAI Codex CLI.
 * Optimized for code analysis and technical recommendations.
 */

import { exec as execCallback, spawn } from 'node:child_process'
import { promisify } from 'node:util'

import { ExternalServiceError, logger, NetworkError } from '@pcu/utils'
import type {
  AIProviderInfo,
  AnalysisContext,
  AnalysisResult,
  AnalysisType,
} from '../../../domain/interfaces/aiProvider.js'
import { BaseAIProvider, type BaseProviderOptions } from './baseProvider.js'

const exec = promisify(execCallback)

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
 */
export class CodexProvider extends BaseAIProvider {
  readonly name = 'codex'
  readonly priority = 60
  readonly capabilities: AnalysisType[] = ['impact', 'security', 'compatibility', 'recommend']

  private readonly model: string
  private readonly maxTokens: number
  private readonly approvalMode: string
  private cachedAvailability: boolean | null = null
  private cachedInfo: AIProviderInfo | null = null

  constructor(options: CodexProviderOptions = {}) {
    super(options)
    this.model = options.model ?? 'o3'
    this.maxTokens = options.maxTokens ?? 4096
    this.approvalMode = options.approvalMode ?? 'full-auto'
  }

  /**
   * Check if Codex CLI is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.cachedAvailability !== null) {
      return this.cachedAvailability
    }

    try {
      // Try to run codex --version
      await exec('codex --version', { timeout: 1500 })
      this.cachedAvailability = true
      return true
    } catch {
      try {
        // Fast PATH lookup (non-interactive, avoids hanging on shell rc files)
        const { stdout } = await exec('command -v codex 2>/dev/null', { timeout: 500 })
        const isAvailable = stdout.trim().length > 0
        this.cachedAvailability = isAvailable
        return isAvailable
      } catch {
        // Check for alternative command names (openai-codex, etc.)
        try {
          const { stdout } = await exec('command -v openai-codex 2>/dev/null', { timeout: 500 })
          if (!stdout.trim()) {
            throw new Error('openai-codex not found')
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
   * Get Codex provider information
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
        const { stdout } = await exec('codex --version', { timeout: 1500 })
        version = stdout.trim()
      } catch {
        // Version not available
      }

      try {
        const { stdout } = await exec('command -v codex', { timeout: 500 })
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
   * Perform analysis using Codex CLI
   */
  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now()

    // Check availability first
    if (!(await this.isAvailable())) {
      throw new ExternalServiceError('Codex', 'analyze', 'Codex CLI is not available')
    }

    // Build the prompt
    const prompt = this.buildPrompt(context)

    // Execute Codex CLI
    try {
      const { stdout, stderr } = await this.executeCodexCommand(prompt)

      // Parse the response
      const result = this.parseResponse(stdout || stderr, context)
      result.processingTimeMs = Date.now() - startTime

      return result
    } catch (error) {
      // Log the error for debugging and return a degraded result
      logger.warn('Codex analysis failed, returning degraded result', {
        error: (error as Error).message,
        packages: context.packages.length,
      })
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
      }
    }
  }

  /**
   * Execute Codex CLI command using spawn to avoid shell injection
   */
  private async executeCodexCommand(prompt: string): Promise<{ stdout: string; stderr: string }> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.spawnCodexProcess(prompt)
        return result
      } catch (error) {
        lastError = error as Error

        // Check if it's a timeout error
        if ((error as Error).message.includes('timed out')) {
          throw error
        }

        // Retry on other errors
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * 2 ** (attempt - 1))
        }
      }
    }

    throw lastError ?? new ExternalServiceError('Codex', 'execute', 'Codex CLI execution failed')
  }

  /**
   * Spawn Codex process with proper argument handling to prevent injection
   */
  private spawnCodexProcess(prompt: string): Promise<{ stdout: string; stderr: string }> {
    // Build args array (no shell escaping needed with spawn)
    const args: string[] = [prompt]

    args.push('--approval-mode', this.approvalMode)
    args.push('--quiet')

    if (this.model) {
      args.push('--model', this.model)
    }

    if (this.maxTokens) {
      args.push('--max-tokens', String(this.maxTokens))
    }

    return new Promise((resolve, reject) => {
      const child = spawn('codex', args, {
        env: {
          ...process.env,
          NO_COLOR: '1',
          FORCE_COLOR: '0',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Close stdin immediately
      child.stdin?.end()

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timeoutId = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        reject(new NetworkError('Codex CLI', `timed out after ${this.timeout}ms`))
      }, this.timeout)

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        clearTimeout(timeoutId)
        if (timedOut) return

        if (code === 0) {
          resolve({ stdout, stderr })
        } else {
          reject(new Error(`Codex CLI exited with code ${code}: ${stderr || stdout}`))
        }
      })

      child.on('error', (error) => {
        clearTimeout(timeoutId)
        if (!timedOut) {
          reject(error)
        }
      })
    })
  }

  /**
   * Clear cached availability and info data
   */
  clearCache(): void {
    this.cachedAvailability = null
    this.cachedInfo = null
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
