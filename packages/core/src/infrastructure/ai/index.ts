/**
 * AI Infrastructure Index
 *
 * Central export for all AI-related infrastructure components.
 * Includes providers, cache, detector, and fallback systems.
 */

// AI Detector
export { AIDetector } from './aiDetector.js'
export type { AnalysisCacheOptions, AnalysisCacheStats } from './cache/index.js'
// Cache
export { AnalysisCache, analysisCache } from './cache/index.js'
// Fallback
export { RuleEngine } from './fallback/index.js'
export type {
  BaseProviderOptions,
  ClaudeProviderOptions,
  CodexProviderOptions,
  GeminiProviderOptions,
} from './providers/index.js'
// Providers
export {
  BaseAIProvider,
  ClaudeProvider,
  CodexProvider,
  GeminiProvider,
} from './providers/index.js'
