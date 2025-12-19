/**
 * Rule-based Analysis Engine
 *
 * Fallback engine when AI providers are not available.
 * Provides basic dependency analysis using predefined rules.
 */

import semver from 'semver'

import type {
  AnalysisContext,
  AnalysisResult,
  PackageUpdateInfo,
  Recommendation,
  RiskLevel,
} from '../../../domain/interfaces/aiProvider.js'

/**
 * Known breaking change patterns
 */
const BREAKING_PATTERNS: Record<string, string[]> = {
  react: ['React 17 to 18: Concurrent features', 'React 18+: Strict mode changes'],
  typescript: ['TypeScript 5.0: New decorators', 'TypeScript 4.7+: ESM changes'],
  eslint: ['ESLint 9.0: Flat config required', 'ESLint 8.0+: New rule formats'],
  webpack: ['Webpack 5: Node.js polyfills removed'],
  vite: ['Vite 5: Node.js 18+ required'],
  next: ['Next.js 13+: App router changes', 'Next.js 14+: Server components default'],
  vue: ['Vue 3: Composition API', 'Vue 3: Breaking template changes'],
}

/**
 * Known security-sensitive packages
 */
const SECURITY_SENSITIVE_PACKAGES = new Set([
  'jsonwebtoken',
  'bcrypt',
  'crypto-js',
  'helmet',
  'cors',
  'express-session',
  'passport',
  'oauth',
  'jose',
  'node-forge',
])

/**
 * Rule-based Analysis Engine
 */
export class RuleEngine {
  /**
   * Analyze packages using predefined rules
   */
  analyze(context: AnalysisContext): AnalysisResult {
    const startTime = Date.now()
    const { packages, analysisType } = context

    const recommendations = packages.map((pkg) => this.analyzePackage(pkg, analysisType))

    // Calculate overall risk
    const highRiskCount = recommendations.filter(
      (r) => r.riskLevel === 'high' || r.riskLevel === 'critical'
    ).length

    const summary = this.generateSummary(recommendations, highRiskCount)

    return {
      provider: 'rule-engine',
      analysisType,
      recommendations,
      summary,
      confidence: 0.6, // Rule-based analysis has moderate confidence
      warnings: highRiskCount > 0 ? [`${highRiskCount} high-risk updates detected`] : [],
      timestamp: new Date(),
      processingTimeMs: Date.now() - startTime,
    }
  }

  /**
   * Analyze a single package
   */
  private analyzePackage(pkg: PackageUpdateInfo, _analysisType: string): Recommendation {
    const riskLevel = this.assessRiskLevel(pkg)
    const breakingChanges = this.detectBreakingChanges(pkg)
    const securityFixes = this.detectSecurityRelevance(pkg)

    let action: Recommendation['action'] = 'update'
    let reason = ''

    // Determine action based on risk and update type
    if (riskLevel === 'critical') {
      action = 'review'
      reason = 'Critical risk level requires manual review before update'
    } else if (riskLevel === 'high' && pkg.updateType === 'major') {
      action = 'review'
      reason = 'Major version update with high risk - review breaking changes'
    } else if (pkg.updateType === 'major' && breakingChanges.length > 0) {
      action = 'review'
      reason = `Major update with ${breakingChanges.length} known breaking changes`
    } else if (pkg.updateType === 'patch') {
      action = 'update'
      reason = 'Patch update - typically safe to apply'
    } else if (pkg.updateType === 'minor') {
      action = 'update'
      reason = 'Minor update - new features, backward compatible'
    } else {
      action = 'update'
      reason = 'Update recommended based on analysis'
    }

    // Security-sensitive packages always need review for major updates
    if (SECURITY_SENSITIVE_PACKAGES.has(pkg.name) && pkg.updateType === 'major') {
      action = 'review'
      reason = 'Security-sensitive package - major update requires careful review'
    }

    return {
      package: pkg.name,
      currentVersion: pkg.currentVersion,
      targetVersion: pkg.targetVersion,
      action,
      reason,
      riskLevel,
      breakingChanges,
      securityFixes,
      estimatedEffort: this.estimateEffort(pkg, breakingChanges.length),
    }
  }

  /**
   * Assess risk level based on update type and package characteristics
   */
  private assessRiskLevel(pkg: PackageUpdateInfo): RiskLevel {
    // Pre-release versions are high risk
    if (pkg.targetVersion.includes('-')) {
      return 'high'
    }

    // Check version jump magnitude
    const current = semver.parse(pkg.currentVersion.replace(/^[\^~]/, ''))
    const target = semver.parse(pkg.targetVersion.replace(/^[\^~]/, ''))

    if (!current || !target) {
      return 'medium'
    }

    // Multiple major version jumps are critical
    if (target.major - current.major > 1) {
      return 'critical'
    }

    // Single major version jump is high risk
    if (pkg.updateType === 'major') {
      return 'high'
    }

    // Large minor version jumps are medium risk
    if (pkg.updateType === 'minor' && target.minor - current.minor > 5) {
      return 'medium'
    }

    // Patches and small updates are low risk
    if (pkg.updateType === 'patch') {
      return 'low'
    }

    return 'low'
  }

  /**
   * Detect known breaking changes for popular packages
   */
  private detectBreakingChanges(pkg: PackageUpdateInfo): string[] {
    const changes: string[] = []

    // Check for known breaking patterns
    const packageBase = pkg.name.split('/').pop() || pkg.name
    const knownChanges = BREAKING_PATTERNS[packageBase.toLowerCase()]

    if (knownChanges && pkg.updateType === 'major') {
      changes.push(...knownChanges)
    }

    // Generic breaking change warnings for major updates
    if (pkg.updateType === 'major' && changes.length === 0) {
      changes.push(`Major version update from ${pkg.currentVersion} to ${pkg.targetVersion}`)
    }

    return changes
  }

  /**
   * Detect security relevance of the package
   */
  private detectSecurityRelevance(pkg: PackageUpdateInfo): string[] {
    const fixes: string[] = []

    if (SECURITY_SENSITIVE_PACKAGES.has(pkg.name)) {
      fixes.push('Security-sensitive package - review changelog for security fixes')
    }

    // Check for common security package patterns
    if (pkg.name.includes('auth') || pkg.name.includes('security') || pkg.name.includes('crypto')) {
      fixes.push('Package may contain security-related changes')
    }

    return fixes
  }

  /**
   * Estimate migration effort
   */
  private estimateEffort(
    pkg: PackageUpdateInfo,
    breakingChangesCount: number
  ): 'low' | 'medium' | 'high' {
    if (pkg.updateType === 'patch') {
      return 'low'
    }

    if (pkg.updateType === 'major' && breakingChangesCount > 2) {
      return 'high'
    }

    if (pkg.updateType === 'major') {
      return 'medium'
    }

    return 'low'
  }

  /**
   * Generate summary message
   */
  private generateSummary(recommendations: Recommendation[], highRiskCount: number): string {
    const updateCount = recommendations.filter((r) => r.action === 'update').length
    const reviewCount = recommendations.filter((r) => r.action === 'review').length
    const skipCount = recommendations.filter((r) => r.action === 'skip').length

    const parts: string[] = []

    if (updateCount > 0) {
      parts.push(`${updateCount} package(s) ready to update`)
    }
    if (reviewCount > 0) {
      parts.push(`${reviewCount} package(s) need review`)
    }
    if (skipCount > 0) {
      parts.push(`${skipCount} package(s) recommended to skip`)
    }
    if (highRiskCount > 0) {
      parts.push(`${highRiskCount} high-risk update(s) detected`)
    }

    return parts.join('. ') || 'No updates to analyze'
  }
}
