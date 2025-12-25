/**
 * Impact Analysis Service
 *
 * Handles security and compatibility impact analysis for package updates.
 * Extracted from CatalogUpdateService to reduce class complexity.
 */

import type { NpmRegistryService } from '../../infrastructure/external-services/npmRegistryService.js'

export interface SecurityImpact {
  hasVulnerabilities: boolean
  fixedVulnerabilities: number
  newVulnerabilities: number
  severityChange: 'better' | 'worse' | 'same'
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
    } catch {
      return {
        hasVulnerabilities: false,
        fixedVulnerabilities: 0,
        newVulnerabilities: 0,
        severityChange: 'same',
      }
    }
  }

  /**
   * Assess compatibility risk for update type
   */
  assessCompatibilityRisk(updateType: string): RiskLevel {
    switch (updateType) {
      case 'patch':
        return 'low'
      case 'minor':
        return 'medium'
      case 'major':
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
      return updateType === 'major' ? 'medium' : 'low'
    }

    // New vulnerabilities increase risk
    if (securityImpact.newVulnerabilities > 0) {
      return 'high'
    }

    // Base risk on update type and number of affected packages
    const affectedPackageCount = packageImpacts.length

    if (updateType === 'major') {
      return affectedPackageCount > 5 ? 'high' : 'medium'
    } else if (updateType === 'minor') {
      return affectedPackageCount > 10 ? 'medium' : 'low'
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

    if (securityImpact.fixedVulnerabilities > 0) {
      recommendations.push('Security update recommended - fixes known vulnerabilities')
    }

    if (securityImpact.newVulnerabilities > 0) {
      recommendations.push('New vulnerabilities detected - review carefully before updating')
    }

    if (updateType === 'major') {
      recommendations.push('Review changelog for breaking changes before updating')
      recommendations.push('Test thoroughly in development environment')
    }

    const breakingChangePackages = packageImpacts.filter((p) => p.isBreakingChange)
    if (breakingChangePackages.length > 0) {
      recommendations.push(`${breakingChangePackages.length} package(s) may need code changes`)
    }

    if (packageImpacts.length > 5) {
      recommendations.push('Many packages affected - consider updating in batches')
    }

    if (recommendations.length === 0) {
      recommendations.push('Low risk update - safe to proceed')
    }

    return recommendations
  }
}
