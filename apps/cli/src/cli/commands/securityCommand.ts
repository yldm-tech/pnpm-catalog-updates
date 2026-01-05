/**
 * Security Command
 *
 * CLI command to perform security vulnerability scanning and automated fixes.
 * Integrates with npm audit and snyk for comprehensive security analysis.
 */

import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { CommandExitError, getErrorCode, logger, t, toError } from '@pcu/utils'
import * as fs from 'fs-extra'
import type { OutputFormat, OutputFormatter } from '../formatters/outputFormatter.js'
import { ProgressBar } from '../formatters/progressBar.js'
import { StyledText } from '../themes/colorTheme.js'
import { cliOutput } from '../utils/cliOutput.js'
import { handleCommandError, initializeTheme } from '../utils/commandHelpers.js'
import { errorsOnly, validateSecurityOptions } from '../validators/index.js'

export interface SecurityCommandOptions {
  workspace?: string
  format?: OutputFormat
  audit?: boolean
  fixVulns?: boolean
  severity?: 'low' | 'moderate' | 'high' | 'critical'
  includeDev?: boolean
  snyk?: boolean
  verbose?: boolean
  color?: boolean
}

export interface SecurityReport {
  summary: {
    totalVulnerabilities: number
    critical: number
    high: number
    moderate: number
    low: number
    info: number
  }
  vulnerabilities: Vulnerability[]
  recommendations: SecurityRecommendation[]
  metadata: {
    scanDate: string
    scanTools: string[]
    workspacePath: string
  }
}

export interface Vulnerability {
  id: string
  package: string
  severity: 'low' | 'moderate' | 'high' | 'critical'
  title: string
  url: string
  range: string
  fixAvailable: boolean | string
  fixVersion?: string
  paths: string[]
  cwe?: string[]
  cve?: string[]
  /** Detailed description/overview of the vulnerability */
  overview?: string
  /** Currently installed version of the package */
  installedVersion?: string
}

export interface SecurityRecommendation {
  package: string
  currentVersion: string
  recommendedVersion: string
  type: 'update' | 'remove' | 'replace'
  reason: string
  impact: string
}

/**
 * pnpm/npm audit response vulnerability entry
 */
interface AuditVulnerability {
  name: string
  severity: 'low' | 'moderate' | 'high' | 'critical'
  title?: string
  url?: string
  range: string
  fixAvailable: boolean | string
  via?: Array<{ source?: string; name?: string }>
  cwe?: string[]
  cve?: string[]
}

/**
 * pnpm/npm audit response structure
 */
interface AuditData {
  vulnerabilities?: Record<string, AuditVulnerability>
}

/**
 * Snyk vulnerability entry
 */
interface SnykVulnerability {
  id: string
  packageName: string
  severity: 'low' | 'moderate' | 'high' | 'critical'
  title: string
  url?: string
  version?: string
  semver?: { vulnerable?: string[] }
  upgradePath?: string[]
  fixedIn?: string[]
  from?: string[]
  identifiers?: { CWE?: string[]; CVE?: string[] }
  cwe?: string[]
  cve?: string[]
}

/**
 * Snyk response structure
 */
interface SnykData {
  vulnerabilities?: SnykVulnerability[]
}

export class SecurityCommand {
  constructor(private readonly outputFormatter: OutputFormatter) {}

  /**
   * Execute the security command
   */
  async execute(options: SecurityCommandOptions = {}): Promise<void> {
    let progressBar: ProgressBar | undefined

    try {
      // Initialize theme using shared helper
      initializeTheme('default')

      // Show loading with progress bar
      progressBar = new ProgressBar({
        text: t('progress.securityAnalyzing'),
      })
      progressBar.start()

      if (options.verbose) {
        cliOutput.print(StyledText.iconAnalysis(t('command.security.scanning')))
        cliOutput.print(
          StyledText.muted(`${t('command.workspace.title')}: ${options.workspace || process.cwd()}`)
        )
        cliOutput.print(
          StyledText.muted(
            t('command.security.severityFilter', { severity: options.severity || 'all' })
          )
        )
        cliOutput.print('')
      }

      // Execute security scan
      const report = await this.performSecurityScan(options)

      progressBar.succeed(t('progress.securityCompleted'))

      // Format and display results
      const formattedOutput = this.outputFormatter.formatSecurityReport(report)
      cliOutput.print(formattedOutput)

      // Show recommendations if available
      if (report.recommendations.length > 0) {
        this.showRecommendations(report)
      }

      // Auto-fix vulnerabilities if requested
      if (options.fixVulns) {
        await this.autoFixVulnerabilities(report, options)
      }

      // Exit with appropriate code based on findings
      const exitCode = report.summary.critical > 0 ? 1 : 0
      throw CommandExitError.withCode(exitCode)
    } catch (error) {
      // Re-throw CommandExitError as-is
      if (error instanceof CommandExitError) {
        throw error
      }

      // QUAL-007: Use unified error handling
      handleCommandError(error, {
        verbose: options.verbose,
        progressBar,
        errorMessage: 'Security scan failed',
        context: { options },
        failedProgressKey: 'progress.securityFailed',
        errorDisplayKey: 'command.security.errorScanning',
      })

      throw CommandExitError.failure('Security scan failed')
    }
  }

  /**
   * Perform comprehensive security scan
   */
  private async performSecurityScan(options: SecurityCommandOptions): Promise<SecurityReport> {
    const workspacePath = options.workspace || process.cwd()
    const vulnerabilities: Vulnerability[] = []
    const recommendations: SecurityRecommendation[] = []

    // Check if package.json exists
    const packageJsonPath = path.join(workspacePath, 'package.json')
    if (!(await fs.pathExists(packageJsonPath))) {
      throw new Error(t('command.security.noPackageJson', { path: workspacePath }))
    }

    // Run pnpm audit
    if (options.audit !== false) {
      const auditVulns = await this.runPnpmAudit(workspacePath, options)
      vulnerabilities.push(...auditVulns)
    }

    // Run snyk scan if available
    if (options.snyk) {
      const snykVulns = await this.runSnykScan(workspacePath, options)
      vulnerabilities.push(...snykVulns)
    }

    // Generate recommendations
    recommendations.push(...this.generateRecommendations(vulnerabilities))

    // Filter by severity if specified
    const filteredVulnerabilities = options.severity
      ? vulnerabilities.filter(
          (v) => this.severityToNumber(v.severity) >= this.severityToNumber(options.severity!)
        )
      : vulnerabilities

    return {
      summary: this.generateSummary(filteredVulnerabilities),
      vulnerabilities: filteredVulnerabilities,
      recommendations: recommendations,
      metadata: {
        scanDate: new Date().toISOString(),
        scanTools: ['pnpm-audit', ...(options.snyk ? ['snyk'] : [])],
        workspacePath: workspacePath,
      },
    }
  }

  /**
   * Run pnpm audit scan
   */
  private async runPnpmAudit(
    workspacePath: string,
    options: SecurityCommandOptions
  ): Promise<Vulnerability[]> {
    const auditArgs = ['audit', '--json']

    if (!options.includeDev) {
      auditArgs.push('--prod')
    }

    const result = spawnSync('pnpm', auditArgs, {
      cwd: workspacePath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (result.error) {
      throw new Error(t('command.security.auditFailed', { message: result.error.message }))
    }

    // pnpm audit returns non-zero when vulnerabilities are found
    if (result.status === 0 || result.status === 1) {
      try {
        const auditData = JSON.parse(result.stdout)
        return this.parseAuditResults(auditData)
      } catch (parseError) {
        throw new Error(t('command.security.auditParseError', { error: String(parseError) }))
      }
    } else {
      throw new Error(
        t('command.security.auditExitError', {
          status: result.status ?? 'unknown',
          error: result.stderr,
        })
      )
    }
  }

  /**
   * Run snyk scan
   */
  private async runSnykScan(
    workspacePath: string,
    options: SecurityCommandOptions
  ): Promise<Vulnerability[]> {
    try {
      // Check if snyk is installed
      const versionResult = spawnSync('snyk', ['--version'], { stdio: 'pipe' })
      if (versionResult.error) {
        throw versionResult.error
      }

      const snykArgs = ['test', '--json']

      if (!options.includeDev) {
        snykArgs.push('--dev')
      }

      const result = spawnSync('snyk', snykArgs, {
        cwd: workspacePath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      if (result.error) {
        throw result.error
      }

      if (result.status !== 0 && result.status !== 1) {
        throw new Error(
          t('command.security.snykScanExitError', {
            status: result.status ?? 'unknown',
            error: result.stderr,
          })
        )
      }

      const snykData = JSON.parse(result.stdout)
      return this.parseSnykResults(snykData)
    } catch (error) {
      // ERR-003: Use type-safe error code extraction
      const errorCode = getErrorCode(error)
      if (errorCode === 'ENOENT') {
        logger.debug('Snyk not found', { code: errorCode })
        cliOutput.warn(StyledText.iconWarning(t('command.security.snykNotFound')))
        return []
      }
      const err = toError(error)
      logger.error('Snyk scan failed', err, { workspacePath })
      throw new Error(t('command.security.snykScanFailed', { message: err.message }))
    }
  }

  /**
   * Parse pnpm/npm audit results
   */
  private parseAuditResults(auditData: AuditData): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = []

    if (!auditData.vulnerabilities) {
      return vulnerabilities
    }

    for (const [id, vulnerability] of Object.entries(auditData.vulnerabilities)) {
      vulnerabilities.push({
        id: id,
        package: vulnerability.name,
        severity: vulnerability.severity,
        title: vulnerability.title || vulnerability.name,
        url: vulnerability.url || `https://npmjs.com/advisories/${id}`,
        range: vulnerability.range,
        fixAvailable: vulnerability.fixAvailable,
        fixVersion:
          vulnerability.fixAvailable === true ? String(vulnerability.fixAvailable) : undefined,
        paths: vulnerability.via?.map((v) => v.source || v.name || '') || [vulnerability.name],
        cwe: vulnerability.cwe,
        cve: vulnerability.cve,
      })
    }

    return vulnerabilities
  }

  /**
   * Parse snyk results
   */
  private parseSnykResults(snykData: SnykData): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = []

    if (!snykData.vulnerabilities) {
      return vulnerabilities
    }

    for (const vuln of snykData.vulnerabilities) {
      vulnerabilities.push({
        id: vuln.id,
        package: vuln.packageName,
        severity: vuln.severity,
        title: vuln.title,
        url: vuln.url || '',
        range: vuln.semver?.vulnerable?.join(' || ') || vuln.version || '',
        fixAvailable: (vuln.fixedIn?.length ?? 0) > 0,
        fixVersion: vuln.fixedIn?.[0],
        paths: vuln.from || [vuln.packageName],
        cwe: vuln.identifiers?.CWE || [],
        cve: vuln.identifiers?.CVE || [],
      })
    }

    return vulnerabilities
  }

  /**
   * Generate security recommendations
   */
  private generateRecommendations(vulnerabilities: Vulnerability[]): SecurityRecommendation[] {
    const recommendations: SecurityRecommendation[] = []
    const packages = new Set(vulnerabilities.map((v) => v.package))

    for (const pkg of packages) {
      const pkgVulns = vulnerabilities.filter((v) => v.package === pkg)
      const criticalVulns = pkgVulns.filter(
        (v) => v.severity === 'critical' || v.severity === 'high'
      )

      if (criticalVulns.length > 0) {
        const fixVersions = [
          ...new Set(
            criticalVulns.map((v) => v.fixVersion).filter((v) => v && typeof v === 'string')
          ),
        ]

        if (fixVersions.length > 0) {
          const currentVersion = pkgVulns[0]?.range?.split(' ')[0] || 'unknown'
          const recommendedVersion = fixVersions[0] || 'unknown'

          recommendations.push({
            package: pkg,
            currentVersion: currentVersion,
            recommendedVersion: recommendedVersion,
            type: 'update',
            reason: t('command.security.criticalVulnsFound', { count: criticalVulns.length }),
            impact: t('command.security.highImpactFix'),
          })
        }
      }
    }

    return recommendations
  }

  /**
   * Generate summary from vulnerabilities
   */
  private generateSummary(vulnerabilities: Vulnerability[]): SecurityReport['summary'] {
    const summary = {
      totalVulnerabilities: vulnerabilities.length,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0,
    }

    for (const vuln of vulnerabilities) {
      const severity = vuln.severity as string
      switch (severity) {
        case 'critical':
          summary.critical++
          break
        case 'high':
          summary.high++
          break
        case 'moderate':
          summary.moderate++
          break
        case 'low':
          summary.low++
          break
        case 'info':
          summary.info++
          break
        default:
          summary.info++
          break
      }
    }

    return summary
  }

  /**
   * Convert severity string to number for filtering
   */
  private severityToNumber(severity: string): number {
    switch (severity) {
      case 'critical':
        return 4
      case 'high':
        return 3
      case 'moderate':
        return 2
      case 'low':
        return 1
      case 'info':
        return 0
      default:
        return 0
    }
  }

  /**
   * Show security recommendations
   * QUAL-011: Use unified output helpers (cliOutput, StyledText)
   */
  private showRecommendations(report: SecurityReport): void {
    if (report.recommendations.length === 0) {
      return
    }

    cliOutput.print(`\n${StyledText.iconInfo(t('command.security.recommendations'))}`)

    for (const rec of report.recommendations) {
      cliOutput.print(
        `  ${StyledText.iconWarning()} ${rec.package}: ${rec.currentVersion} → ${rec.recommendedVersion}`
      )
      cliOutput.print(`    ${StyledText.muted(rec.reason)}`)
      cliOutput.print(`    ${StyledText.muted(rec.impact)}`)
    }

    cliOutput.print('')
    cliOutput.print(StyledText.iconUpdate(t('command.security.runWithFix')))
  }

  /**
   * Auto-fix vulnerabilities
   * QUAL-011: Use unified output helpers (cliOutput, StyledText)
   */
  private async autoFixVulnerabilities(
    report: SecurityReport,
    options: SecurityCommandOptions
  ): Promise<void> {
    if (report.recommendations.length === 0) {
      cliOutput.print(StyledText.iconSuccess(t('command.security.noFixesAvailable')))
      return
    }

    cliOutput.print(`\n${StyledText.iconUpdate(t('command.security.applyingFixes'))}`)

    const workspacePath = options.workspace || process.cwd()
    const fixableVulns = report.recommendations.filter((r) => r.type === 'update')

    if (fixableVulns.length === 0) {
      cliOutput.print(StyledText.iconInfo(t('command.security.noAutoFixes')))
      return
    }

    try {
      // Run pnpm audit --fix
      const fixArgs = ['audit', '--fix']
      if (!options.includeDev) {
        fixArgs.push('--prod')
      }

      const result = spawnSync('pnpm', fixArgs, {
        cwd: workspacePath,
        encoding: 'utf8',
        stdio: 'inherit',
      })

      if (result.error) {
        throw result.error
      }

      if (result.status !== 0) {
        throw new Error(
          t('command.security.auditFixFailed', { status: result.status ?? 'unknown' })
        )
      }

      cliOutput.print(StyledText.iconSuccess(t('command.security.fixesApplied')))

      // Re-run scan to verify fixes
      cliOutput.print(StyledText.iconInfo(t('command.security.verifyingFixes')))
      const newReport = await this.performSecurityScan({ ...options, fixVulns: false })

      if (newReport.summary.critical === 0 && newReport.summary.high === 0) {
        cliOutput.print(StyledText.iconSuccess(t('command.security.allFixed')))
      } else {
        cliOutput.print(
          StyledText.iconWarning(
            `${newReport.summary.critical} critical and ${newReport.summary.high} high severity vulnerabilities remain`
          )
        )
      }
    } catch (error) {
      const err = toError(error)
      logger.error('Failed to apply security fixes', err, { workspacePath, options })
      cliOutput.error(StyledText.iconError(t('command.security.fixesFailed')))
      cliOutput.error(StyledText.error(err.message))
    }
  }

  /**
   * Validate command options
   * QUAL-002: Uses unified validator from validators/
   */
  static validateOptions(options: SecurityCommandOptions): string[] {
    return errorsOnly(validateSecurityOptions)(options)
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Security vulnerability scanning and automated fixes

Usage:
  pcu security [options]

Options:
  --workspace <path>     Workspace directory (default: current directory)
  --format <type>        Output format: table, json, yaml, minimal (default: table)
  --audit                Perform pnpm audit scan (default: true)
  --fix-vulns            Automatically fix vulnerabilities using pnpm audit --fix
  --severity <level>     Filter by severity: low, moderate, high, critical
  --include-dev          Include dev dependencies in scan
  --snyk                 Include Snyk scan (requires snyk CLI)
  --verbose              Show detailed information
  --no-color             Disable colored output

Examples:
  pcu security                           # Basic security scan using pnpm audit
  pcu security --fix-vulns              # Scan and fix vulnerabilities
  pcu security --severity high          # Show only high severity issues
  pcu security --snyk                   # Include Snyk scan
  pcu security --format json            # Output as JSON

Exit Codes:
  0  No vulnerabilities found
  1  Vulnerabilities found
  2  Error occurred
    `
  }
}
