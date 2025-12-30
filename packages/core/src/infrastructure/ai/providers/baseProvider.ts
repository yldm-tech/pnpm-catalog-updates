/**
 * Base AI Provider
 *
 * Abstract base class for all AI providers.
 * Provides common functionality for executing CLI commands and parsing responses.
 */

import { exec as execCallback, spawn } from 'node:child_process'
import { promisify } from 'node:util'

import {
  buildSafeCommand,
  ExternalServiceError,
  getCommandVersion,
  getErrorMessage,
  logger,
  NetworkError,
  toError,
  whichCommand,
} from '@pcu/utils'
import type {
  AIProvider,
  AIProviderConfig,
  AIProviderInfo,
  AnalysisContext,
  AnalysisResult,
  AnalysisType,
  Recommendation,
  RiskLevel,
} from '../../../domain/interfaces/aiProvider.js'
import { AI_LIMITS, AI_TIMEOUTS, calculateBackoffDelay } from '../constants.js'

const exec = promisify(execCallback)

/**
 * Base configuration for providers
 */
export interface BaseProviderOptions {
  config?: AIProviderConfig
  /** Timeout for analysis operations in milliseconds (default: 300000) */
  timeout?: number
  /** Timeout for CLI detection/version checks in milliseconds (default: 3000) */
  detectionTimeout?: number
  maxRetries?: number
}

/**
 * Raw recommendation from AI response (before normalization)
 */
interface RawAIRecommendation {
  package?: string
  name?: string
  currentVersion?: string
  targetVersion?: string
  action?: string
  reason?: string
  riskLevel?: string
  breakingChanges?: string[]
  securityFixes?: string[]
  estimatedEffort?: string
}

/**
 * Parsed AI response structure
 */
interface ParsedAIResponse {
  summary?: string
  recommendations?: RawAIRecommendation[]
  details?: string
  warnings?: string[]
}

/**
 * Abstract base class for AI providers
 * QUAL-001: Consolidated common functionality to eliminate duplicate code
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string
  abstract readonly priority: number
  abstract readonly capabilities: AnalysisType[]

  protected readonly config: AIProviderConfig
  protected readonly timeout: number
  protected readonly detectionTimeout: number
  protected readonly maxRetries: number

  // QUAL-001: Common caching for all providers
  private cachedAvailability: boolean | null = null
  private cachedInfo: AIProviderInfo | null = null

  constructor(options: BaseProviderOptions = {}) {
    this.config = options.config ?? { enabled: true }
    this.timeout = options.timeout ?? AI_TIMEOUTS.ANALYSIS_DEFAULT
    this.detectionTimeout = options.detectionTimeout ?? AI_TIMEOUTS.DETECTION_DEFAULT
    this.maxRetries = options.maxRetries ?? AI_LIMITS.DEFAULT_RETRIES
  }

  /**
   * QUAL-001: Get display name (capitalized) for user-facing messages
   */
  protected get displayName(): string {
    return this.name.charAt(0).toUpperCase() + this.name.slice(1)
  }

  /**
   * Get the CLI command name for this provider
   * Subclasses should override to specify their command
   */
  protected abstract getCliCommand(): string

  /**
   * Get alternate CLI command names to try
   * Subclasses can override to provide alternates (e.g., 'gemini-cli')
   */
  protected getAlternateCommands(): string[] {
    return []
  }

  /**
   * Build CLI arguments for analysis
   * Subclasses must implement to build provider-specific args
   */
  protected abstract buildCliArgs(prompt: string): string[]

  /**
   * QUAL-001: Check if the provider is available (with caching)
   */
  async isAvailable(): Promise<boolean> {
    if (this.cachedAvailability !== null) {
      return this.cachedAvailability
    }

    const isAvailable = await this.checkCliAvailability(
      this.getCliCommand(),
      this.getAlternateCommands()
    )
    this.cachedAvailability = isAvailable
    return isAvailable
  }

  /**
   * QUAL-001: Get provider information (with caching)
   */
  async getInfo(): Promise<AIProviderInfo> {
    if (this.cachedInfo) {
      return this.cachedInfo
    }

    const available = await this.isAvailable()
    let version: string | undefined
    let path: string | undefined

    if (available) {
      const details = await this.getCliDetails(this.getCliCommand())
      version = details.version
      path = details.path
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
   * QUAL-001: Perform analysis using template method pattern
   */
  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now()

    // Check availability first
    if (!(await this.isAvailable())) {
      throw new ExternalServiceError(
        this.displayName,
        'analyze',
        `${this.displayName} CLI is not available`
      )
    }

    // Build the prompt
    const prompt = this.buildPrompt(context)

    // Execute CLI
    try {
      const { stdout, stderr } = await this.executeCliWithRetry(prompt)

      // Parse the response
      const result = this.parseResponse(stdout || stderr, context)
      result.processingTimeMs = Date.now() - startTime

      return result
    } catch (error) {
      return this.createDegradedResult(context, toError(error), startTime)
    }
  }

  /**
   * QUAL-001: Clear cached availability and info data
   */
  clearCache(): void {
    this.cachedAvailability = null
    this.cachedInfo = null
  }

  /**
   * QUAL-001: Create degraded result when analysis fails
   */
  protected createDegradedResult(
    context: AnalysisContext,
    error: Error,
    startTime: number
  ): AnalysisResult {
    logger.warn(`${this.displayName} analysis failed, returning degraded result`, {
      error: error.message,
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
        reason: `${this.displayName} analysis failed: ${error.message}`,
        riskLevel: 'medium' as const,
      })),
      summary: 'Analysis failed, manual review recommended',
      confidence: 0.1,
      warnings: [`${this.displayName} CLI error: ${error.message}`],
      timestamp: new Date(),
      processingTimeMs: Date.now() - startTime,
    }
  }

  /**
   * QUAL-001: Execute CLI command with retry logic
   */
  protected async executeCliWithRetry(prompt: string): Promise<{ stdout: string; stderr: string }> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.spawnCliProcess(prompt)
        return result
      } catch (error) {
        lastError = toError(error)

        // Don't retry timeout errors
        if (lastError.message.includes('timed out')) {
          throw error
        }

        // Retry on other errors with exponential backoff
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * 2 ** (attempt - 1))
        }
      }
    }

    throw (
      lastError ??
      new ExternalServiceError(this.name, 'execute', `${this.name} CLI execution failed`)
    )
  }

  /**
   * QUAL-001: Spawn CLI process with timeout handling
   */
  protected spawnCliProcess(prompt: string): Promise<{ stdout: string; stderr: string }> {
    const args = this.buildCliArgs(prompt)

    return new Promise((resolve, reject) => {
      const child = spawn(this.getCliCommand(), args, {
        env: {
          ...process.env,
          NO_COLOR: '1',
          FORCE_COLOR: '0',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Close stdin immediately - CLI waits for stdin to close before processing
      child.stdin?.end()

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timeoutId = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        reject(new NetworkError(`${this.name} CLI`, `timed out after ${this.timeout}ms`))
      }, this.timeout)

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('close', (code: number | null) => {
        clearTimeout(timeoutId)
        if (timedOut) return

        if (code === 0) {
          resolve({ stdout, stderr })
        } else {
          reject(new Error(`${this.name} CLI exited with code ${code}: ${stderr || stdout}`))
        }
      })

      child.on('error', (error: Error) => {
        clearTimeout(timeoutId)
        if (!timedOut) {
          reject(error)
        }
      })
    })
  }

  /**
   * Execute a CLI command with timeout and retry
   *
   * SECURITY: Uses buildSafeCommand to prevent command injection
   */
  protected async executeCommand(
    command: string,
    args: string[],
    _input?: string
  ): Promise<{ stdout: string; stderr: string }> {
    // SECURITY: Use safe command building to prevent injection
    const fullCommand = buildSafeCommand(command, args)

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await exec(fullCommand, {
          timeout: this.timeout,
          maxBuffer: AI_LIMITS.MAX_BUFFER,
          env: { ...process.env, NO_COLOR: '1' },
        })

        return result
      } catch (error) {
        lastError = toError(error)

        if (attempt < this.maxRetries) {
          // Exponential backoff
          await this.sleep(calculateBackoffDelay(attempt))
        }
      }
    }

    throw lastError ?? new Error('Command execution failed')
  }

  /**
   * Format security vulnerability data for inclusion in prompt
   */
  protected formatSecurityData(context: AnalysisContext): string {
    if (!context.securityData || context.securityData.size === 0) {
      return ''
    }

    const lines: string[] = []
    lines.push('\n=== REAL-TIME SECURITY VULNERABILITY DATA (from OSV API) ===')
    lines.push('IMPORTANT: This is live data from the Open Source Vulnerabilities database.')
    lines.push('Use this information to accurately assess security risks.\n')

    for (const pkg of context.packages) {
      const key = `${pkg.name}@${pkg.targetVersion}`
      const securityInfo = context.securityData.get(key)

      if (securityInfo && securityInfo.totalVulnerabilities > 0) {
        lines.push(
          `🚨 ${pkg.name}@${pkg.targetVersion}: ${securityInfo.totalVulnerabilities} VULNERABILITIES FOUND`
        )

        for (const vuln of securityInfo.vulnerabilities) {
          const cveIds = vuln.aliases.filter((a) => a.startsWith('CVE-')).join(', ') || vuln.id
          const scoreStr = vuln.cvssScore ? ` (CVSS: ${vuln.cvssScore})` : ''
          lines.push(`   - [${vuln.severity}]${scoreStr} ${cveIds}: ${vuln.summary}`)
          if (vuln.fixedVersions.length > 0) {
            lines.push(`     Fixed in: ${vuln.fixedVersions.join(', ')}`)
          }
        }

        if (securityInfo.hasCriticalVulnerabilities) {
          lines.push(`   ⛔ CRITICAL: DO NOT recommend updating to this version!`)
        } else if (securityInfo.hasHighVulnerabilities) {
          lines.push(`   ⚠️ HIGH RISK: Consider alternative versions.`)
        }

        // Include verified safe version recommendation if available
        if (securityInfo.safeVersion) {
          const sv = securityInfo.safeVersion
          const versionNote = sv.sameMajor
            ? sv.sameMinor
              ? '(same major and minor version)'
              : '(same major version)'
            : '(different major version - may require migration)'

          // Show skipped versions and their vulnerabilities
          if (sv.skippedVersions && sv.skippedVersions.length > 0) {
            lines.push('')
            lines.push(`   ❌ SKIPPED VERSIONS (still have vulnerabilities):`)
            for (const skipped of sv.skippedVersions) {
              lines.push(`      - ${pkg.name}@${skipped.version}:`)
              for (const vuln of skipped.vulnerabilities) {
                lines.push(`        • [${vuln.severity}] ${vuln.id}: ${vuln.summary}`)
              }
            }
          }

          lines.push('')
          lines.push(`   ✅ VERIFIED SAFE VERSION: ${pkg.name}@${sv.version} ${versionNote}`)
          lines.push(
            `      This version has been verified to have NO critical or high severity vulnerabilities.`
          )
          lines.push(
            `      (Checked ${sv.versionsChecked} version(s) to find this safe alternative)`
          )
          lines.push(`      RECOMMENDATION: Update to ${pkg.name}@${sv.version} instead.`)
        }

        lines.push('')
      } else {
        lines.push(`✅ ${pkg.name}@${pkg.targetVersion}: No known vulnerabilities`)
      }
    }

    lines.push('=== END SECURITY DATA ===\n')
    return lines.join('\n')
  }

  /**
   * Build the analysis prompt
   */
  protected buildPrompt(context: AnalysisContext): string {
    const { packages, workspaceInfo, analysisType, options: _options } = context

    const packageList = packages
      .map(
        (p) =>
          `- ${p.name}: ${p.currentVersion} -> ${p.targetVersion} (${p.updateType}${p.catalogName ? `, catalog: ${p.catalogName}` : ''})`
      )
      .join('\n')

    // Include security vulnerability data if available
    const securityDataSection = this.formatSecurityData(context)

    const prompts: Record<AnalysisType, string> = {
      impact: `Analyze the impact of updating these packages in a pnpm workspace:

Workspace: ${workspaceInfo.name}
Packages: ${workspaceInfo.packageCount}
Catalogs: ${workspaceInfo.catalogCount}

Updates to analyze:
${packageList}
${securityDataSection}
For each package, provide:
1. Risk level (low/medium/high/critical) - MUST be "critical" if there are CRITICAL vulnerabilities
2. Potential breaking changes
3. Recommended action (update/skip/review/defer) - MUST be "skip" for versions with CRITICAL vulnerabilities
4. Reason for recommendation
5. Estimated migration effort

IMPORTANT RULES:
1. If security data shows CRITICAL vulnerabilities, you MUST:
   - Set riskLevel to "critical"
   - Set action to "skip"
   - Include the CVE IDs in the reason

2. If NO security data is provided above OR security data shows "No known vulnerabilities":
   - DO NOT invent or fabricate CVE IDs, GHSA IDs, or vulnerability information
   - Set securityFixes to empty array []
   - Base your analysis ONLY on breaking changes and compatibility, NOT security
   - Be honest: say "No known security vulnerabilities" in the reason if applicable

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
      "securityFixes": ["CVE-xxxx-xxxxx"],
      "estimatedEffort": "low|medium|high"
    }
  ],
  "warnings": ["warning1", "warning2"]
}`,

      security: `Analyze the security implications of these package updates:

Workspace: ${workspaceInfo.name}

Updates to analyze:
${packageList}
${securityDataSection}
For each package:
1. Check if the update fixes known vulnerabilities (use the security data above)
2. Assess if the new version introduces security risks
3. Evaluate the package maintainer reputation
4. Check for suspicious changes

CRITICAL: Use the real-time security data provided above. If a version has CRITICAL vulnerabilities,
you MUST recommend "skip" action with riskLevel "critical" and list all CVE IDs.

Respond in JSON format with security-focused recommendations.`,

      compatibility: `Analyze the compatibility of these package updates:

Workspace: ${workspaceInfo.name}
Packages in workspace: ${workspaceInfo.packageCount}
Catalogs: ${workspaceInfo.catalogCount}

Updates to analyze:
${packageList}
${securityDataSection}
For each package:
1. Check peer dependency compatibility
2. Identify potential conflicts with other packages
3. Assess API compatibility
4. Check for deprecated features
5. Consider security implications from the data above

Respond in JSON format with compatibility-focused recommendations.`,

      recommend: `Provide smart recommendations for updating these packages:

Workspace: ${workspaceInfo.name}
Context: pnpm workspace with catalog-based dependency management

Updates available:
${packageList}
${securityDataSection}
Consider:
1. SECURITY FIRST: Never recommend versions with CRITICAL vulnerabilities
2. Update priority based on security, features, and stability
3. Grouping related packages for atomic updates
4. Best practices for the specific package ecosystem
5. Risk vs. benefit analysis

CRITICAL: If security data shows vulnerabilities:
- CRITICAL severity → action: "skip", riskLevel: "critical"
- HIGH severity → action: "review", riskLevel: "high"
- Include CVE IDs in the reason

Respond in JSON format with prioritized recommendations.`,
    }

    return prompts[analysisType]
  }

  /**
   * Parse the AI response into structured recommendations
   * MAINT-001: Improved JSON extraction with multiple fallback strategies
   */
  protected parseResponse(response: string, context: AnalysisContext): AnalysisResult {
    const startTime = Date.now()

    try {
      // MAINT-001: Try multiple strategies to extract valid JSON
      const parsed = this.extractJsonFromResponse(response)
      if (!parsed) {
        return this.createFallbackResult(context, response)
      }

      const recommendations: Recommendation[] = (parsed.recommendations || []).map(
        (rec: RawAIRecommendation) => ({
          package: rec.package || rec.name || '',
          currentVersion: rec.currentVersion || '',
          targetVersion: rec.targetVersion || '',
          action: this.normalizeAction(rec.action),
          reason: rec.reason || '',
          riskLevel: this.normalizeRiskLevel(rec.riskLevel),
          breakingChanges: rec.breakingChanges || [],
          securityFixes: rec.securityFixes || [],
          estimatedEffort: this.normalizeEffort(rec.estimatedEffort),
        })
      )

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
      }
    } catch (error) {
      // Log the parsing error for debugging
      logger.warn('Failed to parse AI response, using fallback result', {
        provider: this.name,
        error: getErrorMessage(error),
        responseLength: response.length,
      })
      return this.createFallbackResult(context, response)
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
    }
  }

  /**
   * QUAL-001: Validate that parsed JSON conforms to expected structure
   * Returns validated object or null if validation fails
   */
  private validateParsedResponse(parsed: unknown): ParsedAIResponse | null {
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }

    const obj = parsed as Record<string, unknown>

    // Validate recommendations is an array if present
    if ('recommendations' in obj && !Array.isArray(obj.recommendations)) {
      return null
    }

    // Validate warnings is an array if present
    if ('warnings' in obj && !Array.isArray(obj.warnings)) {
      return null
    }

    // Validate summary is a string if present
    if ('summary' in obj && typeof obj.summary !== 'string') {
      return null
    }

    return obj as ParsedAIResponse
  }

  /**
   * MAINT-001: Extract valid JSON from AI response with multiple fallback strategies
   * QUAL-001: Added schema validation to prevent runtime errors
   *
   * Strategies tried in order:
   * 1. Parse response directly as JSON
   * 2. Extract JSON from markdown code blocks (```json ... ```)
   * 3. Find balanced JSON object using bracket matching
   * 4. Use greedy regex as last resort
   */
  private extractJsonFromResponse(response: string): ParsedAIResponse | null {
    const trimmed = response.trim()

    // Strategy 1: Try parsing the whole response as JSON
    try {
      const parsed = JSON.parse(trimmed)
      return this.validateParsedResponse(parsed)
    } catch {
      // Not direct JSON, try other strategies
    }

    // Strategy 2: Extract from markdown code blocks
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch?.[1]) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim())
        const validated = this.validateParsedResponse(parsed)
        if (validated) return validated
      } catch {
        // Code block content is not valid JSON
      }
    }

    // Strategy 3: Find balanced JSON object using bracket matching
    const jsonStart = trimmed.indexOf('{')
    if (jsonStart !== -1) {
      let depth = 0
      let inString = false
      let escape = false

      for (let i = jsonStart; i < trimmed.length; i++) {
        const char = trimmed[i]

        if (escape) {
          escape = false
          continue
        }

        if (char === '\\') {
          escape = true
          continue
        }

        if (char === '"' && !escape) {
          inString = !inString
          continue
        }

        if (!inString) {
          if (char === '{') depth++
          else if (char === '}') {
            depth--
            if (depth === 0) {
              const jsonStr = trimmed.slice(jsonStart, i + 1)
              try {
                const parsed = JSON.parse(jsonStr)
                const validated = this.validateParsedResponse(parsed)
                if (validated) return validated
              } catch {
                // Balanced brackets but invalid JSON, continue searching
              }
              break
            }
          }
        }
      }
    }

    // Strategy 4: Greedy regex as last resort (original behavior)
    const greedyMatch = trimmed.match(/\{[\s\S]*\}/)
    if (greedyMatch) {
      try {
        const parsed = JSON.parse(greedyMatch[0])
        return this.validateParsedResponse(parsed)
      } catch {
        // Greedy match failed
      }
    }

    return null
  }

  /**
   * Normalize action string
   */
  private normalizeAction(action: string | undefined): Recommendation['action'] {
    const normalized = action?.toLowerCase()
    if (normalized && ['update', 'skip', 'review', 'defer'].includes(normalized)) {
      return normalized as Recommendation['action']
    }
    return 'review'
  }

  /**
   * Normalize risk level string
   */
  private normalizeRiskLevel(level: string | undefined): RiskLevel {
    const normalized = level?.toLowerCase()
    if (normalized && ['low', 'medium', 'high', 'critical'].includes(normalized)) {
      return normalized as RiskLevel
    }
    return 'medium'
  }

  /**
   * Normalize estimated effort string
   */
  private normalizeEffort(effort: string | undefined): 'low' | 'medium' | 'high' {
    const normalized = effort?.toLowerCase()
    if (normalized && ['low', 'medium', 'high'].includes(normalized)) {
      return normalized as 'low' | 'medium' | 'high'
    }
    return 'medium'
  }

  /**
   * Calculate confidence score based on response quality
   */
  private calculateConfidence(recommendations: Recommendation[], expectedCount: number): number {
    if (recommendations.length === 0) return 0

    let score = 0

    // Coverage: how many packages have recommendations
    score += (recommendations.length / expectedCount) * 0.3

    // Completeness: how complete each recommendation is
    const completenessSum = recommendations.reduce((sum, rec) => {
      let complete = 0
      if (rec.package) complete += 0.2
      if (rec.action) complete += 0.2
      if (rec.reason && rec.reason.length > 10) complete += 0.3
      if (rec.riskLevel) complete += 0.15
      if (rec.breakingChanges && rec.breakingChanges.length > 0) complete += 0.15
      return sum + complete
    }, 0)
    score += (completenessSum / recommendations.length) * 0.7

    return Math.min(score, 1)
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * DUP-001: Check if a CLI command is available
   *
   * Uses cross-platform command detection (which/where) with fallback to version check.
   * This consolidates the duplicate availability check logic from all providers.
   *
   * @param primaryCommand - The main command name to check (e.g., 'claude', 'gemini')
   * @param alternateCommands - Alternative command names to try (e.g., 'gemini-cli')
   * @param versionFlag - Flag to use for version check fallback (default: '--version')
   */
  protected async checkCliAvailability(
    primaryCommand: string,
    alternateCommands: string[] = [],
    versionFlag = '--version'
  ): Promise<boolean> {
    try {
      // Try primary command first
      const primaryPath = await whichCommand(primaryCommand, this.detectionTimeout)
      if (primaryPath) {
        return true
      }

      // Try alternate command names
      for (const altCommand of alternateCommands) {
        const altPath = await whichCommand(altCommand, this.detectionTimeout)
        if (altPath) {
          return true
        }
      }

      // Fallback: try to get version directly (might work if command is aliased)
      const version = await getCommandVersion(primaryCommand, versionFlag, this.detectionTimeout)
      return version !== null
    } catch {
      return false
    }
  }

  /**
   * DUP-001: Get CLI path and version information
   *
   * Retrieves the executable path and version for a CLI command.
   * This consolidates the duplicate getInfo logic from all providers.
   *
   * @param primaryCommand - The main command name (e.g., 'claude', 'gemini')
   * @param versionFlag - Flag to use for version retrieval (default: '--version')
   */
  protected async getCliDetails(
    primaryCommand: string,
    versionFlag = '--version'
  ): Promise<{ path: string | undefined; version: string | undefined }> {
    const version = await getCommandVersion(primaryCommand, versionFlag, this.detectionTimeout)
    const path = await whichCommand(primaryCommand, this.detectionTimeout)

    return {
      version: version ?? undefined,
      path: path ?? 'alias',
    }
  }
}
