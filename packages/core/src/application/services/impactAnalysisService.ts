/**
 * Impact Analysis Service
 *
 * Handles security and compatibility impact analysis for package updates.
 * Extracted from CatalogUpdateService to reduce class complexity.
 */

import { logger } from '@pcu/utils'
import type { NpmRegistryService } from '../../infrastructure/external-services/npmRegistryService.js'

/**
 * ARCH-003: Constants for update types to avoid magic strings
 */
export const UPDATE_TYPES = {
  PATCH: 'patch',
  MINOR: 'minor',
  MAJOR: 'major',
} as const

/**
 * ARCH-003: Constants for risk assessment thresholds
 */
export const RISK_THRESHOLDS = {
  /** Number of affected packages that elevates major update risk to 'high' */
  MAJOR_UPDATE_HIGH_RISK: 5,
  /** Number of affected packages that elevates minor update risk to 'medium' */
  MINOR_UPDATE_MEDIUM_RISK: 10,
} as const

export interface SecurityImpact {
  hasVulnerabilities: boolean
  fixedVulnerabilities: number
  newVulnerabilities: number
  severityChange: 'better' | 'worse' | 'same'
  /** Indicates if the analysis failed and default values were returned */
  analysisIncomplete?: boolean
  /** Error message if analysis failed */
  errorMessage?: string
}

export interface PackageImpact {
  packageName: string
  packagePath: string
  dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'
  isBreakingChange: boolean
  compatibilityRisk: 'low' | 'medium' | 'high'
}

export type RiskLevel = 'low' | 'medium' | 'high'

export class ImpactAnalysisService {
  constructor(private readonly registryService: NpmRegistryService) {}

  /**
   * Analyze security impact of version change
   */
  async analyzeSecurityImpact(
    packageName: string,
    currentVersion: string,
    newVersion: string
  ): Promise<SecurityImpact> {
    try {
      const [currentSecurity, newSecurity] = await Promise.all([
        this.registryService.checkSecurityVulnerabilities(packageName, currentVersion),
        this.registryService.checkSecurityVulnerabilities(packageName, newVersion),
      ])

      const fixedVulnerabilities =
        currentSecurity.vulnerabilities.length - newSecurity.vulnerabilities.length
      const newVulnerabilities = Math.max(
        0,
        newSecurity.vulnerabilities.length - currentSecurity.vulnerabilities.length
      )

      let severityChange: SecurityImpact['severityChange'] = 'same'
      if (fixedVulnerabilities > 0) {
        severityChange = 'better'
      } else if (newVulnerabilities > 0) {
        severityChange = 'worse'
      }

      return {
        hasVulnerabilities: currentSecurity.hasVulnerabilities || newSecurity.hasVulnerabilities,
        fixedVulnerabilities: Math.max(0, fixedVulnerabilities),
        newVulnerabilities,
        severityChange,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn(`Security impact analysis failed for ${packageName}`, {
        packageName,
        currentVersion,
        newVersion,
        error: errorMessage,
      })

      return {
        hasVulnerabilities: false,
        fixedVulnerabilities: 0,
        newVulnerabilities: 0,
        severityChange: 'same',
        analysisIncomplete: true,
        errorMessage,
      }
    }
  }

  /**
   * Assess compatibility risk for update type
   */
  assessCompatibilityRisk(updateType: string): RiskLevel {
    switch (updateType) {
      case UPDATE_TYPES.PATCH:
        return 'low'
      case UPDATE_TYPES.MINOR:
        return 'medium'
      case UPDATE_TYPES.MAJOR:
        return 'high'
      default:
        return 'medium'
    }
  }

  /**
   * Assess overall risk level
   */
  assessOverallRisk(
    updateType: string,
    packageImpacts: PackageImpact[],
    securityImpact: SecurityImpact
  ): RiskLevel {
    // Security fixes reduce risk
    if (securityImpact.fixedVulnerabilities > 0) {
      return updateType === UPDATE_TYPES.MAJOR ? 'medium' : 'low'
    }

    // New vulnerabilities increase risk
    if (securityImpact.newVulnerabilities > 0) {
      return 'high'
    }

    // Base risk on update type and number of affected packages
    const affectedPackageCount = packageImpacts.length

    if (updateType === UPDATE_TYPES.MAJOR) {
      return affectedPackageCount > RISK_THRESHOLDS.MAJOR_UPDATE_HIGH_RISK ? 'high' : 'medium'
    } else if (updateType === UPDATE_TYPES.MINOR) {
      return affectedPackageCount > RISK_THRESHOLDS.MINOR_UPDATE_MEDIUM_RISK ? 'medium' : 'low'
    } else {
      return 'low'
    }
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(
    updateType: string,
    securityImpact: SecurityImpact,
    packageImpacts: PackageImpact[]
  ): string[] {
    const recommendations: string[] = []

    if (securityImpact.analysisIncomplete) {
      recommendations.push(
        'Security analysis incomplete - manual review recommended before updating'
      )
    }

    if (securityImpact.fixedVulnerabilities > 0) {
      recommendations.push('Security update recommended - fixes known vulnerabilities')
    }

    if (securityImpact.newVulnerabilities > 0) {
      recommendations.push('New vulnerabilities detected - review carefully before updating')
    }

    if (updateType === UPDATE_TYPES.MAJOR) {
      recommendations.push('Review changelog for breaking changes before updating')
      recommendations.push('Test thoroughly in development environment')
    }

    const breakingChangePackages = packageImpacts.filter((p) => p.isBreakingChange)
    if (breakingChangePackages.length > 0) {
      recommendations.push(`${breakingChangePackages.length} package(s) may need code changes`)
    }

    if (packageImpacts.length > RISK_THRESHOLDS.MAJOR_UPDATE_HIGH_RISK) {
      recommendations.push('Many packages affected - consider updating in batches')
    }

    if (recommendations.length === 0) {
      recommendations.push('Low risk update - safe to proceed')
    }

    return recommendations
  }
}
