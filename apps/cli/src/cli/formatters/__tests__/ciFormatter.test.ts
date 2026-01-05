/**
 * CI Formatter Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @pcu/utils
vi.mock('@pcu/utils', () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (params) {
      let result = key
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{{${k}}}`, String(v))
      }
      return result
    }
    return key
  },
}))

const { CIFormatter } = await import('../ciFormatter.js')

describe('CIFormatter', () => {
  // Test data fixtures
  const mockOutdatedReport = {
    hasUpdates: true,
    totalOutdated: 3,
    catalogs: [
      {
        catalogName: 'default',
        outdatedDependencies: [
          {
            packageName: 'lodash',
            currentVersion: '4.17.20',
            latestVersion: '4.17.21',
            updateType: 'patch',
            isSecurityUpdate: false,
          },
          {
            packageName: 'react',
            currentVersion: '17.0.0',
            latestVersion: '18.0.0',
            updateType: 'major',
            isSecurityUpdate: false,
          },
          {
            packageName: 'axios',
            currentVersion: '0.21.0',
            latestVersion: '1.0.0',
            updateType: 'major',
            isSecurityUpdate: true,
          },
        ],
      },
    ],
  }

  const mockEmptyOutdatedReport = {
    hasUpdates: false,
    totalOutdated: 0,
    catalogs: [],
  }

  const mockUpdateResult = {
    success: true,
    totalUpdated: 2,
    totalErrors: 0,
    updatedDependencies: [
      {
        packageName: 'lodash',
        catalogName: 'default',
        fromVersion: '4.17.20',
        toVersion: '4.17.21',
      },
      {
        packageName: 'react',
        catalogName: 'default',
        fromVersion: '17.0.0',
        toVersion: '18.0.0',
      },
    ],
    errors: [],
  }

  const mockUpdateResultWithErrors = {
    success: false,
    totalUpdated: 1,
    totalErrors: 1,
    updatedDependencies: [
      {
        packageName: 'lodash',
        catalogName: 'default',
        fromVersion: '4.17.20',
        toVersion: '4.17.21',
      },
    ],
    errors: [
      {
        packageName: 'react',
        catalogName: 'default',
        error: 'Network timeout',
        fatal: false,
      },
    ],
  }

  const mockUpdatePlan = {
    totalUpdates: 2,
    hasConflicts: false,
    conflicts: [],
    updates: [
      {
        packageName: 'lodash',
        catalogName: 'default',
        currentVersion: '4.17.20',
        newVersion: '4.17.21',
        updateType: 'patch',
      },
      {
        packageName: 'react',
        catalogName: 'default',
        currentVersion: '17.0.0',
        newVersion: '18.0.0',
        updateType: 'major',
      },
    ],
  }

  const mockUpdatePlanWithConflicts = {
    totalUpdates: 2,
    hasConflicts: true,
    conflicts: [
      {
        packageName: 'react',
        versions: ['17.0.0', '18.0.0'],
      },
    ],
    updates: [
      {
        packageName: 'react',
        catalogName: 'default',
        currentVersion: '17.0.0',
        newVersion: '18.0.0',
        updateType: 'major',
      },
    ],
  }

  const mockValidationReport = {
    isValid: true,
    errors: [],
    warnings: ['Consider pinning version for lodash'],
  }

  const mockInvalidValidationReport = {
    isValid: false,
    errors: ['Missing pnpm-workspace.yaml', 'Invalid catalog configuration'],
    warnings: ['Consider pinning version for lodash'],
  }

  const mockSecurityReport = {
    summary: {
      totalVulnerabilities: 2,
      critical: 1,
      high: 1,
      moderate: 0,
      low: 0,
    },
    vulnerabilities: [
      {
        id: 'VULN-001',
        package: 'axios',
        title: 'Server-Side Request Forgery',
        severity: 'critical',
        overview: 'SSRF vulnerability in axios',
        cwe: 918,
        fixAvailable: '1.0.0',
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-12345',
        installedVersion: '0.21.0',
      },
      {
        id: 'VULN-002',
        package: 'lodash',
        title: 'Prototype Pollution',
        severity: 'high',
        overview: 'Prototype pollution in lodash',
        cwe: 1321,
        fixAvailable: '4.17.21',
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-54321',
        installedVersion: '4.17.20',
      },
    ],
    metadata: {
      scanDate: '2024-01-01T00:00:00.000Z',
    },
  }

  const mockEmptySecurityReport = {
    summary: {
      totalVulnerabilities: 0,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
    },
    vulnerabilities: [],
    metadata: {
      scanDate: '2024-01-01T00:00:00.000Z',
    },
  }

  describe('GitHub Actions format', () => {
    let formatter: InstanceType<typeof CIFormatter>

    beforeEach(() => {
      formatter = new CIFormatter('github')
    })

    describe('formatOutdatedReport', () => {
      it('should format outdated report with GitHub annotations', () => {
        const output = formatter.formatOutdatedReport(mockOutdatedReport)

        expect(output).toContain('::warning')
        expect(output).toContain('::notice')
        expect(output).toContain('::group::')
        expect(output).toContain('lodash')
        expect(output).toContain('react')
        expect(output).toContain('axios')
        expect(output).toContain('[SECURITY]')
      })

      it('should format notice when no updates found', () => {
        const output = formatter.formatOutdatedReport(mockEmptyOutdatedReport)

        expect(output).toContain('::notice')
        expect(output).toContain('format.allUpToDate')
      })
    })

    describe('formatUpdateResult', () => {
      it('should format successful update result', () => {
        const output = formatter.formatUpdateResult(mockUpdateResult)

        expect(output).toContain('::notice')
        expect(output).toContain('format.updatedCount')
        expect(output).toContain('::group::')
      })

      it('should format update result with errors', () => {
        const output = formatter.formatUpdateResult(mockUpdateResultWithErrors)

        expect(output).toContain('::error')
        expect(output).toContain('Network timeout')
      })
    })

    describe('formatUpdatePlan', () => {
      it('should format update plan', () => {
        const output = formatter.formatUpdatePlan(mockUpdatePlan)

        expect(output).toContain('::notice')
        expect(output).toContain('format.plannedUpdates')
        expect(output).toContain('lodash')
        expect(output).toContain('react')
      })

      it('should format plan with conflicts', () => {
        const output = formatter.formatUpdatePlan(mockUpdatePlanWithConflicts)

        expect(output).toContain('::warning')
        expect(output).toContain('Version conflict')
      })

      it('should format empty plan', () => {
        const output = formatter.formatUpdatePlan({
          totalUpdates: 0,
          hasConflicts: false,
          conflicts: [],
          updates: [],
        })

        expect(output).toContain('::notice')
        expect(output).toContain('format.noUpdatesPlanned')
      })
    })

    describe('formatValidationReport', () => {
      it('should format valid workspace', () => {
        const output = formatter.formatValidationReport(mockValidationReport)

        expect(output).toContain('::notice')
        expect(output).toContain('format.valid')
      })

      it('should format invalid workspace with errors', () => {
        const output = formatter.formatValidationReport(mockInvalidValidationReport)

        expect(output).toContain('::error')
        expect(output).toContain('format.invalid')
        expect(output).toContain('Missing pnpm-workspace.yaml')
      })
    })

    describe('formatSecurityReport', () => {
      it('should format security report with vulnerabilities', () => {
        const output = formatter.formatSecurityReport(mockSecurityReport)

        expect(output).toContain('::error')
        expect(output).toContain('critical')
        expect(output).toContain('axios')
        expect(output).toContain('lodash')
      })

      it('should format notice when no vulnerabilities', () => {
        const output = formatter.formatSecurityReport(mockEmptySecurityReport)

        expect(output).toContain('::notice')
        expect(output).toContain('format.noVulnsFound')
      })
    })
  })

  describe('GitLab CI format', () => {
    let formatter: InstanceType<typeof CIFormatter>

    beforeEach(() => {
      formatter = new CIFormatter('gitlab')
    })

    describe('formatOutdatedReport', () => {
      it('should format outdated report as GitLab code quality JSON', () => {
        const output = formatter.formatOutdatedReport(mockOutdatedReport)
        const parsed = JSON.parse(output)

        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed.length).toBe(3)
        expect(parsed[0]).toHaveProperty('description')
        expect(parsed[0]).toHaveProperty('check_name', 'outdated-dependency')
        expect(parsed[0]).toHaveProperty('fingerprint')
        expect(parsed[0]).toHaveProperty('severity')
        expect(parsed[0]).toHaveProperty('location')
      })
    })

    describe('formatUpdateResult', () => {
      it('should format update errors as GitLab code quality JSON', () => {
        const output = formatter.formatUpdateResult(mockUpdateResultWithErrors)
        const parsed = JSON.parse(output)

        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed.length).toBe(1)
        expect(parsed[0].check_name).toBe('update-error')
      })
    })

    describe('formatSecurityReport', () => {
      it('should format as GitLab Security Report', () => {
        const output = formatter.formatSecurityReport(mockSecurityReport)
        const parsed = JSON.parse(output)

        expect(parsed.version).toBe('15.0.0')
        expect(parsed.vulnerabilities).toHaveLength(2)
        expect(parsed.scan).toBeDefined()
        expect(parsed.scan.scanner.id).toBe('pcu-security')
      })
    })
  })

  describe('JUnit XML format', () => {
    let formatter: InstanceType<typeof CIFormatter>

    beforeEach(() => {
      formatter = new CIFormatter('junit')
    })

    describe('formatOutdatedReport', () => {
      it('should format as JUnit XML', () => {
        const output = formatter.formatOutdatedReport(mockOutdatedReport)

        expect(output).toContain('<?xml version="1.0"')
        expect(output).toContain('<testsuites')
        expect(output).toContain('<testsuite')
        expect(output).toContain('<testcase')
        expect(output).toContain('lodash')
      })

      it('should mark major updates as failures', () => {
        const output = formatter.formatOutdatedReport(mockOutdatedReport)

        expect(output).toContain('<failure')
        expect(output).toContain('major update')
      })
    })

    describe('formatUpdateResult', () => {
      it('should format as JUnit XML', () => {
        const output = formatter.formatUpdateResult(mockUpdateResult)

        expect(output).toContain('<?xml version="1.0"')
        expect(output).toContain('pcu-update')
        expect(output).toContain('failures="0"')
      })

      it('should include failures for errors', () => {
        const output = formatter.formatUpdateResult(mockUpdateResultWithErrors)

        expect(output).toContain('failures="1"')
        expect(output).toContain('<failure')
        expect(output).toContain('Network timeout')
      })
    })

    describe('formatSecurityReport', () => {
      it('should format vulnerabilities as test failures', () => {
        const output = formatter.formatSecurityReport(mockSecurityReport)

        expect(output).toContain('<?xml version="1.0"')
        expect(output).toContain('pcu-security')
        expect(output).toContain('<failure')
        expect(output).toContain('SecurityVulnerability')
      })
    })
  })

  describe('SARIF format', () => {
    let formatter: InstanceType<typeof CIFormatter>

    beforeEach(() => {
      formatter = new CIFormatter('sarif')
    })

    describe('formatOutdatedReport', () => {
      it('should format as valid SARIF JSON', () => {
        const output = formatter.formatOutdatedReport(mockOutdatedReport)
        const parsed = JSON.parse(output)

        expect(parsed.$schema).toContain('sarif-schema')
        expect(parsed.version).toBe('2.1.0')
        expect(parsed.runs).toHaveLength(1)
        expect(parsed.runs[0].tool.driver.name).toBe('pcu-check')
        expect(parsed.runs[0].results.length).toBeGreaterThan(0)
      })

      it('should include rules for each update type', () => {
        const output = formatter.formatOutdatedReport(mockOutdatedReport)
        const parsed = JSON.parse(output)

        const rules = parsed.runs[0].tool.driver.rules
        expect(rules.some((r: { id: string }) => r.id === 'outdated-major')).toBe(true)
        expect(rules.some((r: { id: string }) => r.id === 'outdated-patch')).toBe(true)
      })
    })

    describe('formatUpdateResult', () => {
      it('should format as valid SARIF JSON', () => {
        const output = formatter.formatUpdateResult(mockUpdateResult)
        const parsed = JSON.parse(output)

        expect(parsed.runs[0].tool.driver.name).toBe('pcu-update')
        expect(parsed.runs[0].results.length).toBe(2)
      })
    })

    describe('formatUpdatePlan', () => {
      it('should format as valid SARIF JSON', () => {
        const output = formatter.formatUpdatePlan(mockUpdatePlan)
        const parsed = JSON.parse(output)

        expect(parsed.runs[0].tool.driver.name).toBe('pcu-update-plan')
      })

      it('should include conflict results', () => {
        const output = formatter.formatUpdatePlan(mockUpdatePlanWithConflicts)
        const parsed = JSON.parse(output)

        const conflictResults = parsed.runs[0].results.filter(
          (r: { ruleId: string }) => r.ruleId === 'version-conflict'
        )
        expect(conflictResults.length).toBeGreaterThan(0)
      })
    })

    describe('formatValidationReport', () => {
      it('should format as valid SARIF JSON', () => {
        const output = formatter.formatValidationReport(mockInvalidValidationReport)
        const parsed = JSON.parse(output)

        expect(parsed.runs[0].tool.driver.name).toBe('pcu-validation')
        expect(
          parsed.runs[0].results.some((r: { ruleId: string }) => r.ruleId === 'validation-error')
        ).toBe(true)
      })
    })

    describe('formatSecurityReport', () => {
      it('should format as valid SARIF JSON', () => {
        const output = formatter.formatSecurityReport(mockSecurityReport)
        const parsed = JSON.parse(output)

        expect(parsed.runs[0].tool.driver.name).toBe('pcu-security')
        expect(parsed.runs[0].results.length).toBe(2)
      })

      it('should map severity levels correctly', () => {
        const output = formatter.formatSecurityReport(mockSecurityReport)
        const parsed = JSON.parse(output)

        const criticalResult = parsed.runs[0].results.find(
          (r: { properties: { severity: string } }) => r.properties.severity === 'critical'
        )
        expect(criticalResult.level).toBe('error')
      })
    })
  })

  describe('default format fallback', () => {
    it('should return JSON for unknown format', () => {
      // @ts-expect-error Testing unknown format
      const formatter = new CIFormatter('unknown')
      const output = formatter.formatOutdatedReport(mockOutdatedReport)
      const parsed = JSON.parse(output)

      expect(parsed).toEqual(mockOutdatedReport)
    })
  })
})
