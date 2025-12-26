/**
 * AI Provider Constants
 *
 * MAGIC-001: Centralized configuration values for AI providers.
 * This improves maintainability and makes it easier to adjust settings.
 */

/**
 * Timeout configurations (in milliseconds)
 */
export const AI_TIMEOUTS = {
  /** Default timeout for analysis operations (5 minutes) */
  ANALYSIS_DEFAULT: 300_000,
  /** Timeout for CLI detection and version checks (3 seconds) */
  DETECTION_DEFAULT: 3_000,
  /** Base delay for exponential backoff retry (1 second) */
  RETRY_BASE_DELAY: 1_000,
  /** Maximum delay for exponential backoff (10 seconds) */
  RETRY_MAX_DELAY: 10_000,
} as const

/**
 * Buffer and limit configurations
 */
export const AI_LIMITS = {
  /** Maximum buffer size for command output (10MB) */
  MAX_BUFFER: 10 * 1024 * 1024,
  /** Default number of retries for failed operations */
  DEFAULT_RETRIES: 2,
  /** Default max tokens for AI responses */
  DEFAULT_MAX_TOKENS: 4_096,
} as const

/**
 * Default model configurations by provider
 */
export const AI_MODELS = {
  /** Default Claude model */
  CLAUDE_DEFAULT: 'claude-sonnet-4-20250514',
  /** Default Gemini model */
  GEMINI_DEFAULT: 'gemini-2.5-pro',
  /** Default Codex model */
  CODEX_DEFAULT: 'o3',
} as const

/**
 * Provider priority values
 * Higher priority = preferred provider when multiple are available
 */
export const AI_PRIORITIES = {
  /** Claude provider priority (highest) */
  CLAUDE: 100,
  /** Gemini provider priority */
  GEMINI: 80,
  /** Codex provider priority */
  CODEX: 60,
} as const

/**
 * Calculate exponential backoff delay
 * @param attempt Current attempt number (1-based)
 * @param baseDelay Base delay in milliseconds
 * @param maxDelay Maximum delay cap in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number = AI_TIMEOUTS.RETRY_BASE_DELAY,
  maxDelay: number = AI_TIMEOUTS.RETRY_MAX_DELAY
): number {
  return Math.min(baseDelay * 2 ** (attempt - 1), maxDelay)
}
