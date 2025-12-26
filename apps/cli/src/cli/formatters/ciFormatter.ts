/**
 * CI/CD Output Formatter
 *
 * Provides formatted output specifically designed for CI/CD pipelines.
 * Supports GitHub Actions, GitLab CI, JUnit XML, and SARIF formats.
 */

import type { OutdatedReport, UpdatePlan, UpdateResult, WorkspaceValidationReport } from '@pcu/core'
import { t } from '@pcu/utils'
import type { SecurityReport } from '../commands/securityCommand.js'

export type CIOutputFormat = 'github' | 'gitlab' | 'junit' | 'sarif'

/**
 * GitHub Actions annotation levels
 */
type GitHubAnnotationLevel = 'error' | 'warning' | 'notice'

/**
 * SARIF severity levels
 */
type SARIFLevel = 'error' | 'warning' | 'note' | 'none'

export class CIFormatter {
  constructor(private readonly format: CIOutputFormat) {}

  /**
   * Format outdated dependencies report for CI
   */
  formatOutdatedReport(report: OutdatedReport): string {
    switch (this.format) {
      case 'github':
        return this.formatOutdatedGitHub(report)
      case 'gitlab':
        return this.formatOutdatedGitLab(report)
      case 'junit':
        return this.formatOutdatedJUnit(report)
      case 'sarif':
        return this.formatOutdatedSARIF(report)
      default:
        return JSON.stringify(report, null, 2)
    }
  }

  /**
   * Format update result for CI
   */
  formatUpdateResult(result: UpdateResult): string {
    switch (this.format) {
      case 'github':
        return this.formatUpdateResultGitHub(result)
      case 'gitlab':
        return this.formatUpdateResultGitLab(result)
      case 'junit':
        return this.formatUpdateResultJUnit(result)
      case 'sarif':
        return this.formatUpdateResultSARIF(result)
      default:
        return JSON.stringify(result, null, 2)
    }
  }

  /**
   * Format update plan for CI
   */
  formatUpdatePlan(plan: UpdatePlan): string {
    switch (this.format) {
      case 'github':
        return this.formatUpdatePlanGitHub(plan)
      case 'gitlab':
        return this.formatUpdatePlanGitLab(plan)
      case 'junit':
        return this.formatUpdatePlanJUnit(plan)
      case 'sarif':
        return this.formatUpdatePlanSARIF(plan)
      default:
        return JSON.stringify(plan, null, 2)
    }
  }

  /**
   * Format validation report for CI
   */
  formatValidationReport(report: WorkspaceValidationReport): string {
    switch (this.format) {
      case 'github':
        return this.formatValidationGitHub(report)
      case 'gitlab':
        return this.formatValidationGitLab(report)
      case 'junit':
        return this.formatValidationJUnit(report)
      case 'sarif':
        return this.formatValidationSARIF(report)
      default:
        return JSON.stringify(report, null, 2)
    }
  }

  /**
   * Format security report for CI
   */
  formatSecurityReport(report: SecurityReport): string {
    switch (this.format) {
      case 'github':
        return this.formatSecurityGitHub(report)
      case 'gitlab':
        return this.formatSecurityGitLab(report)
      case 'junit':
        return this.formatSecurityJUnit(report)
      case 'sarif':
        return this.formatSecuritySARIF(report)
      default:
        return JSON.stringify(report, null, 2)
    }
  }

  // ==================== GitHub Actions Format ====================

  /**
   * Create GitHub Actions annotation
   * @see https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
   */
  private createGitHubAnnotation(
    level: GitHubAnnotationLevel,
    message: string,
    options?: {
      file?: string
      line?: number
      endLine?: number
      col?: number
      endColumn?: number
      title?: string
    }
  ): string {
    const params: string[] = []
    if (options?.file) params.push(`file=${options.file}`)
    if (options?.line) params.push(`line=${options.line}`)
    if (options?.endLine) params.push(`endLine=${options.endLine}`)
    if (options?.col) params.push(`col=${options.col}`)
    if (options?.endColumn) params.push(`endColumn=${options.endColumn}`)
    if (options?.title) params.push(`title=${options.title}`)

    const paramStr = params.length > 0 ? ` ${params.join(',')}` : ''
    return `::${level}${paramStr}::${message.replace(/\n/g, '%0A')}`
  }

  /**
   * Create GitHub Actions group
   */
  private createGitHubGroup(name: string, content: string): string {
    return `::group::${name}\n${content}\n::endgroup::`
  }

  private formatOutdatedGitHub(report: OutdatedReport): string {
    const lines: string[] = []

    if (!report.hasUpdates) {
      lines.push(
        this.createGitHubAnnotation('notice', t('format.allUpToDate'), { title: 'pcu check' })
      )
      return lines.join('\n')
    }

    // Summary notice
    lines.push(
      this.createGitHubAnnotation(
        'warning',
        t('format.foundOutdated', { count: String(report.totalOutdated) }),
        { title: 'pcu check' }
      )
    )

    // Group outdated dependencies
    const depLines: string[] = []
    for (const catalog of report.catalogs) {
      for (const dep of catalog.outdatedDependencies) {
        const level: GitHubAnnotationLevel = dep.updateType === 'major' ? 'warning' : 'notice'
        const securityNote = dep.isSecurityUpdate ? ' [SECURITY]' : ''
        depLines.push(
          this.createGitHubAnnotation(
            level,
            `${dep.packageName}: ${dep.currentVersion} → ${dep.latestVersion} (${dep.updateType})${securityNote}`,
            {
              file: 'pnpm-workspace.yaml',
              title: `Outdated: ${dep.packageName}`,
            }
          )
        )
      }
    }
    lines.push(this.createGitHubGroup('Outdated Dependencies', depLines.join('\n')))

    return lines.join('\n')
  }

  private formatUpdateResultGitHub(result: UpdateResult): string {
    const lines: string[] = []

    if (result.success) {
      lines.push(
        this.createGitHubAnnotation(
          'notice',
          t('format.updatedCount', { count: String(result.totalUpdated) }),
          { title: 'pcu update' }
        )
      )
    } else {
      lines.push(
        this.createGitHubAnnotation(
          'error',
          t('format.errorCount', { count: String(result.totalErrors) }),
          { title: 'pcu update' }
        )
      )
    }

    // Updated dependencies
    if (result.updatedDependencies.length > 0) {
      const updateLines = result.updatedDependencies.map(
        (dep) => `${dep.packageName}: ${dep.fromVersion} → ${dep.toVersion}`
      )
      lines.push(this.createGitHubGroup('Updated Dependencies', updateLines.join('\n')))
    }

    // Errors
    for (const error of result.errors) {
      lines.push(
        this.createGitHubAnnotation('error', `${error.packageName}: ${error.error}`, {
          file: 'pnpm-workspace.yaml',
          title: 'Update Error',
        })
      )
    }

    return lines.join('\n')
  }

  private formatUpdatePlanGitHub(plan: UpdatePlan): string {
    const lines: string[] = []

    if (plan.totalUpdates === 0) {
      lines.push(
        this.createGitHubAnnotation('notice', t('format.noUpdatesPlanned'), {
          title: 'pcu update --dry-run',
        })
      )
      return lines.join('\n')
    }

    lines.push(
      this.createGitHubAnnotation(
        'notice',
        t('format.plannedUpdates', { count: String(plan.totalUpdates) }),
        { title: 'pcu update --dry-run' }
      )
    )

    // Planned updates
    const updateLines = plan.updates.map(
      (update) =>
        `${update.packageName}: ${update.currentVersion} → ${update.newVersion} (${update.updateType})`
    )
    lines.push(this.createGitHubGroup('Planned Updates', updateLines.join('\n')))

    // Conflicts
    if (plan.hasConflicts && plan.conflicts.length > 0) {
      for (const conflict of plan.conflicts) {
        lines.push(
          this.createGitHubAnnotation('warning', `Version conflict: ${conflict.packageName}`, {
            file: 'pnpm-workspace.yaml',
            title: 'Version Conflict',
          })
        )
      }
    }

    return lines.join('\n')
  }

  private formatValidationGitHub(report: WorkspaceValidationReport): string {
    const lines: string[] = []

    if (report.isValid) {
      lines.push(
        this.createGitHubAnnotation(
          'notice',
          `${t('format.workspaceValidation')}: ${t('format.valid')}`,
          {
            title: 'pcu workspace --validate',
          }
        )
      )
    } else {
      lines.push(
        this.createGitHubAnnotation(
          'error',
          `${t('format.workspaceValidation')}: ${t('format.invalid')}`,
          {
            title: 'pcu workspace --validate',
          }
        )
      )
    }

    for (const error of report.errors) {
      lines.push(this.createGitHubAnnotation('error', error, { title: 'Validation Error' }))
    }

    for (const warning of report.warnings) {
      lines.push(this.createGitHubAnnotation('warning', warning, { title: 'Validation Warning' }))
    }

    return lines.join('\n')
  }

  private formatSecurityGitHub(report: SecurityReport): string {
    const lines: string[] = []

    const total = report.summary.totalVulnerabilities
    if (total === 0) {
      lines.push(
        this.createGitHubAnnotation('notice', t('format.noVulnsFound'), { title: 'pcu security' })
      )
      return lines.join('\n')
    }

    // Summary
    const level: GitHubAnnotationLevel =
      report.summary.critical > 0 || report.summary.high > 0 ? 'error' : 'warning'
    lines.push(
      this.createGitHubAnnotation(
        level,
        `Found ${total} vulnerabilities (${report.summary.critical} critical, ${report.summary.high} high)`,
        { title: 'pcu security' }
      )
    )

    // Individual vulnerabilities
    for (const vuln of report.vulnerabilities) {
      const vulnLevel: GitHubAnnotationLevel =
        vuln.severity === 'critical' || vuln.severity === 'high' ? 'error' : 'warning'
      lines.push(
        this.createGitHubAnnotation(vulnLevel, `${vuln.package}: ${vuln.title}`, {
          title: `${vuln.severity.toUpperCase()}: ${vuln.package}`,
        })
      )
    }

    return lines.join('\n')
  }

  // ==================== GitLab CI Format ====================

  private formatOutdatedGitLab(report: OutdatedReport): string {
    // GitLab CI uses code quality report format for dependency issues
    const issues = []

    for (const catalog of report.catalogs) {
      for (const dep of catalog.outdatedDependencies) {
        issues.push({
          description: `${dep.packageName} is outdated: ${dep.currentVersion} → ${dep.latestVersion}`,
          check_name: 'outdated-dependency',
          fingerprint: `outdated-${catalog.catalogName}-${dep.packageName}`,
          severity:
            dep.updateType === 'major' ? 'major' : dep.updateType === 'minor' ? 'minor' : 'info',
          location: {
            path: 'pnpm-workspace.yaml',
            lines: { begin: 1 },
          },
          categories: ['Dependency'],
        })
      }
    }

    return JSON.stringify(issues, null, 2)
  }

  private formatUpdateResultGitLab(result: UpdateResult): string {
    const issues = []

    for (const error of result.errors) {
      issues.push({
        description: `Update failed for ${error.packageName}: ${error.error}`,
        check_name: 'update-error',
        fingerprint: `update-error-${error.catalogName}-${error.packageName}`,
        severity: error.fatal ? 'critical' : 'major',
        location: {
          path: 'pnpm-workspace.yaml',
          lines: { begin: 1 },
        },
        categories: ['Dependency Update'],
      })
    }

    return JSON.stringify(issues, null, 2)
  }

  private formatUpdatePlanGitLab(plan: UpdatePlan): string {
    const issues = []

    for (const conflict of plan.conflicts) {
      issues.push({
        description: `Version conflict for ${conflict.packageName}`,
        check_name: 'version-conflict',
        fingerprint: `conflict-${conflict.packageName}`,
        severity: 'major',
        location: {
          path: 'pnpm-workspace.yaml',
          lines: { begin: 1 },
        },
        categories: ['Dependency'],
      })
    }

    return JSON.stringify(issues, null, 2)
  }

  private formatValidationGitLab(report: WorkspaceValidationReport): string {
    const issues = []

    for (const error of report.errors) {
      issues.push({
        description: error,
        check_name: 'workspace-validation',
        fingerprint: `validation-error-${Buffer.from(error).toString('base64').slice(0, 20)}`,
        severity: 'critical',
        location: {
          path: 'pnpm-workspace.yaml',
          lines: { begin: 1 },
        },
        categories: ['Workspace'],
      })
    }

    for (const warning of report.warnings) {
      issues.push({
        description: warning,
        check_name: 'workspace-validation',
        fingerprint: `validation-warning-${Buffer.from(warning).toString('base64').slice(0, 20)}`,
        severity: 'minor',
        location: {
          path: 'pnpm-workspace.yaml',
          lines: { begin: 1 },
        },
        categories: ['Workspace'],
      })
    }

    return JSON.stringify(issues, null, 2)
  }

  private formatSecurityGitLab(report: SecurityReport): string {
    // GitLab Security Report format
    const securityReport = {
      version: '15.0.0',
      vulnerabilities: report.vulnerabilities.map((vuln) => ({
        id: vuln.id || `vuln-${vuln.package}-${Date.now()}`,
        category: 'dependency_scanning',
        name: vuln.title,
        message: vuln.title,
        description: vuln.overview || vuln.title,
        severity: this.mapSeverityToGitLab(vuln.severity),
        solution: vuln.fixAvailable
          ? typeof vuln.fixAvailable === 'string'
            ? `Update to ${vuln.fixAvailable}`
            : 'Update available'
          : 'No fix available',
        scanner: {
          id: 'pcu-security',
          name: 'PCU Security Scanner',
        },
        location: {
          file: 'pnpm-workspace.yaml',
          dependency: {
            package: { name: vuln.package },
            version: vuln.installedVersion || 'unknown',
          },
        },
        identifiers: vuln.cwe
          ? [
              {
                type: 'cwe',
                name: `CWE-${vuln.cwe}`,
                value: String(vuln.cwe),
              },
            ]
          : [],
        links: vuln.url ? [{ url: vuln.url }] : [],
      })),
      scan: {
        scanner: {
          id: 'pcu-security',
          name: 'PCU Security Scanner',
          version: '1.0.0',
          vendor: { name: 'PCU' },
        },
        type: 'dependency_scanning',
        start_time: report.metadata.scanDate,
        end_time: new Date().toISOString(),
        status: 'success',
      },
    }

    return JSON.stringify(securityReport, null, 2)
  }

  private mapSeverityToGitLab(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'Critical'
      case 'high':
        return 'High'
      case 'moderate':
      case 'medium':
        return 'Medium'
      case 'low':
        return 'Low'
      default:
        return 'Info'
    }
  }

  // ==================== JUnit XML Format ====================

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  private formatOutdatedJUnit(report: OutdatedReport): string {
    const testcases: string[] = []
    let failures = 0

    for (const catalog of report.catalogs) {
      for (const dep of catalog.outdatedDependencies) {
        const isFailure = dep.updateType === 'major' || dep.isSecurityUpdate
        if (isFailure) failures++

        const failureElement = isFailure
          ? `<failure message="${this.escapeXml(`${dep.packageName} needs ${dep.updateType} update`)}" type="OutdatedDependency">
Current: ${this.escapeXml(dep.currentVersion)}
Latest: ${this.escapeXml(dep.latestVersion)}
Type: ${dep.updateType}${dep.isSecurityUpdate ? '\nSecurity Update Required' : ''}
</failure>`
          : ''

        testcases.push(`
    <testcase classname="pcu.check.${this.escapeXml(catalog.catalogName)}" name="${this.escapeXml(dep.packageName)}" time="0">
      ${failureElement}
    </testcase>`)
      }
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="pcu-check" tests="${report.totalOutdated}" failures="${failures}" errors="0" time="0">
  <testsuite name="outdated-dependencies" tests="${report.totalOutdated}" failures="${failures}" errors="0">
    ${testcases.join('\n')}
  </testsuite>
</testsuites>`
  }

  private formatUpdateResultJUnit(result: UpdateResult): string {
    const testcases: string[] = []

    for (const dep of result.updatedDependencies) {
      testcases.push(`
    <testcase classname="pcu.update.${this.escapeXml(dep.catalogName)}" name="${this.escapeXml(dep.packageName)}" time="0">
    </testcase>`)
    }

    for (const error of result.errors) {
      testcases.push(`
    <testcase classname="pcu.update.${this.escapeXml(error.catalogName)}" name="${this.escapeXml(error.packageName)}" time="0">
      <failure message="${this.escapeXml(error.error)}" type="UpdateError">${this.escapeXml(error.error)}</failure>
    </testcase>`)
    }

    const total = result.updatedDependencies.length + result.errors.length

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="pcu-update" tests="${total}" failures="${result.errors.length}" errors="0" time="0">
  <testsuite name="dependency-updates" tests="${total}" failures="${result.errors.length}" errors="0">
    ${testcases.join('\n')}
  </testsuite>
</testsuites>`
  }

  private formatUpdatePlanJUnit(plan: UpdatePlan): string {
    const testcases: string[] = []
    let failures = 0

    for (const update of plan.updates) {
      const hasConflict = plan.conflicts.some((c) => c.packageName === update.packageName)
      if (hasConflict) failures++

      const failureElement = hasConflict
        ? `<failure message="Version conflict detected" type="VersionConflict">Multiple catalogs have different versions</failure>`
        : ''

      testcases.push(`
    <testcase classname="pcu.plan.${this.escapeXml(update.catalogName)}" name="${this.escapeXml(update.packageName)}" time="0">
      ${failureElement}
    </testcase>`)
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="pcu-update-plan" tests="${plan.totalUpdates}" failures="${failures}" errors="0" time="0">
  <testsuite name="planned-updates" tests="${plan.totalUpdates}" failures="${failures}" errors="0">
    ${testcases.join('\n')}
  </testsuite>
</testsuites>`
  }

  private formatValidationJUnit(report: WorkspaceValidationReport): string {
    const testcases: string[] = []

    testcases.push(`
    <testcase classname="pcu.validation" name="workspace-structure" time="0">
      ${!report.isValid ? `<failure message="Workspace validation failed" type="ValidationError">${this.escapeXml(report.errors.join('\n'))}</failure>` : ''}
    </testcase>`)

    for (const warning of report.warnings) {
      testcases.push(`
    <testcase classname="pcu.validation" name="warning" time="0">
      <system-out>${this.escapeXml(warning)}</system-out>
    </testcase>`)
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="pcu-validation" tests="${1 + report.warnings.length}" failures="${report.isValid ? 0 : 1}" errors="0" time="0">
  <testsuite name="workspace-validation" tests="${1 + report.warnings.length}" failures="${report.isValid ? 0 : 1}" errors="0">
    ${testcases.join('\n')}
  </testsuite>
</testsuites>`
  }

  private formatSecurityJUnit(report: SecurityReport): string {
    const testcases: string[] = []

    for (const vuln of report.vulnerabilities) {
      const severity = vuln.severity.toLowerCase()
      const isFailure = severity === 'critical' || severity === 'high'

      testcases.push(`
    <testcase classname="pcu.security.${this.escapeXml(vuln.package)}" name="${this.escapeXml(vuln.title)}" time="0">
      ${
        isFailure
          ? `<failure message="${this.escapeXml(vuln.title)}" type="SecurityVulnerability">
Severity: ${vuln.severity}
Package: ${this.escapeXml(vuln.package)}
${vuln.overview ? `Overview: ${this.escapeXml(vuln.overview)}` : ''}
${vuln.fixAvailable ? `Fix: ${typeof vuln.fixAvailable === 'string' ? vuln.fixAvailable : 'Available'}` : 'No fix available'}
</failure>`
          : ''
      }
    </testcase>`)
    }

    const failures = report.vulnerabilities.filter(
      (v) => v.severity === 'critical' || v.severity === 'high'
    ).length

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="pcu-security" tests="${report.summary.totalVulnerabilities}" failures="${failures}" errors="0" time="0">
  <testsuite name="security-vulnerabilities" tests="${report.summary.totalVulnerabilities}" failures="${failures}" errors="0">
    ${testcases.join('\n')}
  </testsuite>
</testsuites>`
  }

  // ==================== SARIF Format ====================

  private mapSeverityToSARIF(severity: string): SARIFLevel {
    switch (severity.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'error'
      case 'moderate':
      case 'medium':
        return 'warning'
      case 'low':
        return 'note'
      default:
        return 'none'
    }
  }

  private formatOutdatedSARIF(report: OutdatedReport): string {
    const results: object[] = []
    const rules: object[] = []
    const ruleIds = new Set<string>()

    for (const catalog of report.catalogs) {
      for (const dep of catalog.outdatedDependencies) {
        const ruleId = `outdated-${dep.updateType}`
        if (!ruleIds.has(ruleId)) {
          ruleIds.add(ruleId)
          rules.push({
            id: ruleId,
            name: `Outdated${dep.updateType.charAt(0).toUpperCase() + dep.updateType.slice(1)}Dependency`,
            shortDescription: { text: `Outdated ${dep.updateType} dependency` },
            fullDescription: { text: `A dependency has an outdated ${dep.updateType} version` },
            defaultConfiguration: {
              level: dep.updateType === 'major' ? 'warning' : 'note',
            },
          })
        }

        results.push({
          ruleId,
          level: dep.updateType === 'major' ? 'warning' : 'note',
          message: {
            text: `${dep.packageName} is outdated: ${dep.currentVersion} → ${dep.latestVersion}`,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: 'pnpm-workspace.yaml' },
                region: { startLine: 1 },
              },
            },
          ],
          properties: {
            packageName: dep.packageName,
            currentVersion: dep.currentVersion,
            latestVersion: dep.latestVersion,
            updateType: dep.updateType,
            isSecurityUpdate: dep.isSecurityUpdate,
            catalog: catalog.catalogName,
          },
        })
      }
    }

    return this.createSARIFDocument('pcu-check', rules, results)
  }

  private formatUpdateResultSARIF(result: UpdateResult): string {
    const results: object[] = []
    const rules: object[] = [
      {
        id: 'update-success',
        name: 'DependencyUpdateSuccess',
        shortDescription: { text: 'Dependency updated successfully' },
        defaultConfiguration: { level: 'note' },
      },
      {
        id: 'update-error',
        name: 'DependencyUpdateError',
        shortDescription: { text: 'Dependency update failed' },
        defaultConfiguration: { level: 'error' },
      },
    ]

    for (const dep of result.updatedDependencies) {
      results.push({
        ruleId: 'update-success',
        level: 'note',
        message: { text: `${dep.packageName} updated: ${dep.fromVersion} → ${dep.toVersion}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'pnpm-workspace.yaml' },
              region: { startLine: 1 },
            },
          },
        ],
      })
    }

    for (const error of result.errors) {
      results.push({
        ruleId: 'update-error',
        level: 'error',
        message: { text: `Failed to update ${error.packageName}: ${error.error}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'pnpm-workspace.yaml' },
              region: { startLine: 1 },
            },
          },
        ],
      })
    }

    return this.createSARIFDocument('pcu-update', rules, results)
  }

  private formatUpdatePlanSARIF(plan: UpdatePlan): string {
    const results: object[] = []
    const rules: object[] = [
      {
        id: 'planned-update',
        name: 'PlannedDependencyUpdate',
        shortDescription: { text: 'Dependency update planned' },
        defaultConfiguration: { level: 'note' },
      },
      {
        id: 'version-conflict',
        name: 'VersionConflict',
        shortDescription: { text: 'Version conflict detected' },
        defaultConfiguration: { level: 'warning' },
      },
    ]

    for (const update of plan.updates) {
      results.push({
        ruleId: 'planned-update',
        level: 'note',
        message: {
          text: `${update.packageName}: ${update.currentVersion} → ${update.newVersion} (${update.updateType})`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'pnpm-workspace.yaml' },
              region: { startLine: 1 },
            },
          },
        ],
      })
    }

    for (const conflict of plan.conflicts) {
      results.push({
        ruleId: 'version-conflict',
        level: 'warning',
        message: { text: `Version conflict for ${conflict.packageName}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'pnpm-workspace.yaml' },
              region: { startLine: 1 },
            },
          },
        ],
      })
    }

    return this.createSARIFDocument('pcu-update-plan', rules, results)
  }

  private formatValidationSARIF(report: WorkspaceValidationReport): string {
    const results: object[] = []
    const rules: object[] = [
      {
        id: 'validation-error',
        name: 'WorkspaceValidationError',
        shortDescription: { text: 'Workspace validation error' },
        defaultConfiguration: { level: 'error' },
      },
      {
        id: 'validation-warning',
        name: 'WorkspaceValidationWarning',
        shortDescription: { text: 'Workspace validation warning' },
        defaultConfiguration: { level: 'warning' },
      },
    ]

    for (const error of report.errors) {
      results.push({
        ruleId: 'validation-error',
        level: 'error',
        message: { text: error },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'pnpm-workspace.yaml' },
              region: { startLine: 1 },
            },
          },
        ],
      })
    }

    for (const warning of report.warnings) {
      results.push({
        ruleId: 'validation-warning',
        level: 'warning',
        message: { text: warning },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'pnpm-workspace.yaml' },
              region: { startLine: 1 },
            },
          },
        ],
      })
    }

    return this.createSARIFDocument('pcu-validation', rules, results)
  }

  private formatSecuritySARIF(report: SecurityReport): string {
    const results: object[] = []
    const rules: object[] = []
    const ruleIds = new Set<string>()

    for (const vuln of report.vulnerabilities) {
      const ruleId = `security-${vuln.severity.toLowerCase()}`
      if (!ruleIds.has(ruleId)) {
        ruleIds.add(ruleId)
        rules.push({
          id: ruleId,
          name: `Security${vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1)}`,
          shortDescription: { text: `${vuln.severity} severity vulnerability` },
          defaultConfiguration: { level: this.mapSeverityToSARIF(vuln.severity) },
        })
      }

      results.push({
        ruleId,
        level: this.mapSeverityToSARIF(vuln.severity),
        message: { text: `${vuln.package}: ${vuln.title}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'pnpm-workspace.yaml' },
              region: { startLine: 1 },
            },
          },
        ],
        properties: {
          package: vuln.package,
          severity: vuln.severity,
          cwe: vuln.cwe,
          fixAvailable: vuln.fixAvailable,
          url: vuln.url,
        },
      })
    }

    return this.createSARIFDocument('pcu-security', rules, results)
  }

  private createSARIFDocument(toolName: string, rules: object[], results: object[]): string {
    const sarif = {
      $schema:
        'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: toolName,
              informationUri: 'https://github.com/user/pnpm-catalog-updates',
              version: '1.0.0',
              rules,
            },
          },
          results,
        },
      ],
    }

    return JSON.stringify(sarif, null, 2)
  }
}
