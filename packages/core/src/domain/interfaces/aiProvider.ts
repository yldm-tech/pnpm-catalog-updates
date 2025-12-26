/**
 * AI Provider Interface
 *
 * Defines the contract for AI providers that can analyze package updates.
 * Supports multiple AI backends (Claude, Gemini, Codex, etc.)
 */

/**
 * Information about a package update for AI analysis
 */
export interface PackageUpdateInfo {
  name: string
  currentVersion: string
  targetVersion: string
  updateType: 'major' | 'minor' | 'patch' | 'prerelease'
  catalogName?: string
}

/**
 * Workspace information for context
 */
export interface WorkspaceInfo {
  name: string
  path: string
  packageCount: number
  catalogCount: number
  isValid?: boolean
  catalogNames?: string[]
}

/**
 * Types of analysis that can be performed
 */
export type AnalysisType =
  | 'impact' // Analyze the impact of updates on the project
  | 'security' // Analyze security implications of updates
  | 'compatibility' // Analyze compatibility between packages
  | 'recommend' // Generate smart recommendations

/**
 * Information about a skipped (unsafe) version
 */
export interface SkippedVersionInfo {
  version: string
  vulnerabilities: Array<{
    id: string
    severity: string
    summary: string
  }>
}

/**
 * Information about a verified safe version
 */
export interface SafeVersionInfo {
  version: string
  sameMajor: boolean
  sameMinor: boolean
  versionsChecked: number
  /** Versions that were checked but found to have vulnerabilities */
  skippedVersions?: SkippedVersionInfo[]
}

/**
 * Security vulnerability information from OSV API
 */
export interface SecurityVulnerabilityData {
  packageName: string
  version: string
  vulnerabilities: Array<{
    id: string
    aliases: string[] // CVE IDs
    summary: string
    severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN'
    cvssScore?: number
    fixedVersions: string[]
  }>
  hasCriticalVulnerabilities: boolean
  hasHighVulnerabilities: boolean
  totalVulnerabilities: number
  /** Verified safe version with no critical/high vulnerabilities */
  safeVersion?: SafeVersionInfo
}

/**
 * Options for analysis
 */
export interface AnalysisOptions {
  maxTokens?: number
  temperature?: number
  timeout?: number
  includeBreakingChanges?: boolean
  includeChangelog?: boolean
}

/**
 * Context for AI analysis
 */
export interface AnalysisContext {
  packages: PackageUpdateInfo[]
  workspaceInfo: WorkspaceInfo
  analysisType: AnalysisType
  options?: AnalysisOptions
  additionalContext?: string
  /** Real-time security vulnerability data from OSV API */
  securityData?: Map<string, SecurityVulnerabilityData>
}

/**
 * Risk level for recommendations
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/**
 * Recommended action for a package
 */
export type RecommendedAction = 'update' | 'skip' | 'review' | 'defer'

/**
 * Individual recommendation for a package update
 */
export interface Recommendation {
  package: string
  currentVersion: string
  targetVersion: string
  action: RecommendedAction
  reason: string
  riskLevel: RiskLevel
  breakingChanges?: string[]
  securityFixes?: string[]
  estimatedEffort?: 'low' | 'medium' | 'high'
}

/**
 * Result of AI analysis
 */
export interface AnalysisResult {
  provider: string
  analysisType: AnalysisType
  recommendations: Recommendation[]
  summary: string
  confidence: number // 0-1 confidence score
  details?: string
  warnings?: string[]
  timestamp: Date
  tokensUsed?: number
  processingTimeMs?: number
}

/**
 * Information about an available AI provider
 */
export interface AIProviderInfo {
  name: string
  version?: string
  path?: string
  available: boolean
  priority: number
  capabilities: AnalysisType[]
}

/**
 * AI Provider interface
 * All AI providers must implement this interface
 */
export interface AIProvider {
  /**
   * Name of the provider (e.g., 'claude', 'gemini', 'codex')
   */
  readonly name: string

  /**
   * Priority for provider selection (higher = preferred)
   */
  readonly priority: number

  /**
   * Analysis types this provider supports
   */
  readonly capabilities: AnalysisType[]

  /**
   * Check if the provider is available and configured
   */
  isAvailable(): Promise<boolean>

  /**
   * Get provider information
   */
  getInfo(): Promise<AIProviderInfo>

  /**
   * Perform analysis on the given context
   */
  analyze(context: AnalysisContext): Promise<AnalysisResult>

  /**
   * Clear cached availability and info data.
   * Call this when you need to re-check provider availability.
   */
  clearCache(): void
}

/**
 * Configuration for AI providers
 */
export interface AIProviderConfig {
  enabled: boolean
  model?: string
  maxTokens?: number
  timeout?: number
  customArgs?: string[]
}

/**
 * Overall AI configuration
 */
export interface AIConfig {
  enabled: boolean
  preferredProvider: 'auto' | string
  providers: Record<string, AIProviderConfig>
  analysisTypes: AnalysisType[]
  cache: {
    enabled: boolean
    ttl: number // seconds
  }
  fallback: {
    enabled: boolean
    useRuleEngine: boolean
  }
  /**
   * Real-time security vulnerability enrichment (OSV API).
   * Can be disabled to avoid network calls in constrained environments.
   */
  securityData?: {
    enabled?: boolean
    /** Concurrency limit for security queries (default: 5) */
    concurrency?: number
    /** Timeout in ms for security queries (default: 10000) */
    timeout?: number
  }
}
