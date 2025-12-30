/**
 * OutputFormatter Snapshot Tests
 *
 * Tests for the OutputFormatter class using snapshot testing
 * to ensure consistent output formatting across different formats.
 */

import type {
  OutdatedReport,
  UpdatePlan,
  UpdateResult,
  WorkspaceInfo,
  WorkspaceStats,
  WorkspaceValidationReport,
} from '@pcu/core'
import { describe, expect, it, vi } from 'vitest'
import { OutputFormatter } from '../outputFormatter.js'

// Mock @pcu/utils functions
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
  // Include async utilities that may be used by the code
  timeout: vi.fn().mockImplementation((promise: Promise<unknown>) => promise),
  delay: vi.fn().mockResolvedValue(undefined),
  retry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}))

// Test fixtures
const mockWorkspace = {
  name: 'test-workspace',
  path: '/path/to/workspace',
}

const mockOutdatedReport: OutdatedReport = {
  workspace: mockWorkspace,
  hasUpdates: true,
  totalOutdated: 3,
  catalogs: [
    {
      catalogName: 'default',
      totalDependencies: 10,
      outdatedCount: 3,
      outdatedDependencies: [
        {
          packageName: 'lodash',
          currentVersion: '^4.17.0',
          latestVersion: '^4.17.21',
          updateType: 'patch',
          isSecurityUpdate: false,
          affectedPackages: ['app1', 'app2'],
        },
        {
          packageName: 'react',
          currentVersion: '^17.0.0',
          latestVersion: '^18.2.0',
          updateType: 'major',
          isSecurityUpdate: false,
          affectedPackages: ['app1'],
        },
        {
          packageName: 'axios',
          currentVersion: '^0.21.0',
          latestVersion: '^1.6.0',
          updateType: 'major',
          isSecurityUpdate: true,
          affectedPackages: ['app2', 'lib1'],
        },
      ],
    },
  ],
}

const mockEmptyOutdatedReport: OutdatedReport = {
  workspace: mockWorkspace,
  hasUpdates: false,
  totalOutdated: 0,
  catalogs: [
    {
      catalogName: 'default',
      totalDependencies: 5,
      outdatedCount: 0,
      outdatedDependencies: [],
    },
  ],
}

const mockUpdatePlan: UpdatePlan = {
  workspace: mockWorkspace,
  totalUpdates: 2,
  hasConflicts: false,
  conflicts: [],
  updates: [
    {
      catalogName: 'default',
      packageName: 'lodash',
      currentVersion: '^4.17.0',
      newVersion: '^4.17.21',
      updateType: 'patch',
    },
    {
      catalogName: 'default',
      packageName: 'express',
      currentVersion: '^4.17.0',
      newVersion: '^4.18.2',
      updateType: 'minor',
    },
  ],
}

const mockUpdatePlanWithConflicts: UpdatePlan = {
  workspace: mockWorkspace,
  totalUpdates: 1,
  hasConflicts: true,
  conflicts: [
    {
      packageName: 'typescript',
      catalogs: [
        { catalogName: 'default', currentVersion: '4.9.0', proposedVersion: '5.0.0' },
        { catalogName: 'legacy', currentVersion: '4.5.0', proposedVersion: '4.9.0' },
      ],
      recommendation: 'Consider aligning TypeScript versions across catalogs',
    },
  ],
  updates: [
    {
      catalogName: 'default',
      packageName: 'lodash',
      currentVersion: '^4.17.0',
      newVersion: '^4.17.21',
      updateType: 'patch',
    },
  ],
}

const mockUpdateResult: UpdateResult = {
  workspace: mockWorkspace,
  success: true,
  totalUpdated: 2,
  totalSkipped: 1,
  totalErrors: 0,
  updatedDependencies: [
    {
      catalogName: 'default',
      packageName: 'lodash',
      fromVersion: '^4.17.0',
      toVersion: '^4.17.21',
      updateType: 'patch',
    },
    {
      catalogName: 'default',
      packageName: 'express',
      fromVersion: '^4.17.0',
      toVersion: '^4.18.2',
      updateType: 'minor',
    },
  ],
  skippedDependencies: [
    {
      catalogName: 'default',
      packageName: 'react',
      reason: 'Major version update requires --force flag',
    },
  ],
  errors: [],
}

const mockFailedUpdateResult: UpdateResult = {
  workspace: mockWorkspace,
  success: false,
  totalUpdated: 0,
  totalSkipped: 0,
  totalErrors: 1,
  updatedDependencies: [],
  skippedDependencies: [],
  errors: [
    {
      catalogName: 'default',
      packageName: 'broken-pkg',
      error: 'Network error while fetching version',
      fatal: true,
    },
  ],
}

const mockWorkspaceInfo: WorkspaceInfo = {
  name: 'test-workspace',
  path: '/path/to/workspace',
  packageCount: 5,
  catalogCount: 2,
  catalogNames: ['default', 'legacy'],
  isValid: true,
}

const mockWorkspaceStats: WorkspaceStats = {
  workspace: mockWorkspace,
  packages: {
    total: 10,
    withCatalogReferences: 8,
  },
  catalogs: {
    total: 2,
    totalEntries: 25,
  },
  dependencies: {
    total: 50,
    catalogReferences: 40,
    byType: {
      dependencies: 30,
      devDependencies: 15,
      peerDependencies: 3,
      optionalDependencies: 2,
    },
  },
}

const mockValidationReport: WorkspaceValidationReport = {
  workspace: {
    path: '/path/to/workspace',
    name: 'test-workspace',
    packageCount: 5,
    catalogCount: 2,
  },
  isValid: true,
  errors: [],
  warnings: ['Consider updating deprecated package "old-package"'],
  recommendations: [
    'Add catalog entries for commonly used packages',
    'Consider using stricter version ranges',
  ],
}

const mockInvalidValidationReport: WorkspaceValidationReport = {
  workspace: {
    path: '/path/to/workspace',
    name: 'test-workspace',
    packageCount: 5,
    catalogCount: 2,
  },
  isValid: false,
  errors: ['Missing required catalog "default"', 'Invalid version range for package "broken-pkg"'],
  warnings: ['Consider updating deprecated package "old-package"'],
  recommendations: ['Fix the errors above before proceeding'],
}

describe('OutputFormatter', () => {
  // Use consistent settings for snapshot tests: no color for readable snapshots
  const formats = ['table', 'json', 'yaml', 'minimal'] as const

  describe('formatOutdatedReport', () => {
    formats.forEach((format) => {
      it(`should format outdated report as ${format}`, () => {
        const formatter = new OutputFormatter(format, false)
        const result = formatter.formatOutdatedReport(mockOutdatedReport)
        expect(result).toMatchSnapshot()
      })
    })

    it('should format empty outdated report', () => {
      const formatter = new OutputFormatter('table', false)
      const result = formatter.formatOutdatedReport(mockEmptyOutdatedReport)
      expect(result).toMatchSnapshot()
    })

    it('should format outdated report minimal with aligned columns', () => {
      const formatter = new OutputFormatter('minimal', false)
      const result = formatter.formatOutdatedReport(mockOutdatedReport)
      // Verify alignment by checking that all lines have similar structure
      const lines = result.split('\n')
      expect(lines.length).toBe(3)
      lines.forEach((line) => {
        expect(line).toContain('→')
      })
    })
  })

  describe('formatUpdatePlan', () => {
    formats.forEach((format) => {
      it(`should format update plan as ${format}`, () => {
        const formatter = new OutputFormatter(format, false)
        const result = formatter.formatUpdatePlan(mockUpdatePlan)
        expect(result).toMatchSnapshot()
      })
    })

    it('should format update plan with conflicts', () => {
      const formatter = new OutputFormatter('table', false)
      const result = formatter.formatUpdatePlan(mockUpdatePlanWithConflicts)
      expect(result).toMatchSnapshot()
    })

    it('should handle empty update plan', () => {
      const emptyPlan: UpdatePlan = {
        workspace: mockWorkspace,
        totalUpdates: 0,
        hasConflicts: false,
        conflicts: [],
        updates: [],
      }
      const formatter = new OutputFormatter('table', false)
      const result = formatter.formatUpdatePlan(emptyPlan)
      expect(result).toMatchSnapshot()
    })
  })

  describe('formatUpdateResult', () => {
    formats.forEach((format) => {
      it(`should format update result as ${format}`, () => {
        const formatter = new OutputFormatter(format, false)
        const result = formatter.formatUpdateResult(mockUpdateResult)
        expect(result).toMatchSnapshot()
      })
    })

    it('should format failed update result', () => {
      const formatter = new OutputFormatter('table', false)
      const result = formatter.formatUpdateResult(mockFailedUpdateResult)
      expect(result).toMatchSnapshot()
    })
  })

  describe('formatWorkspaceInfo', () => {
    formats.forEach((format) => {
      it(`should format workspace info as ${format}`, () => {
        const formatter = new OutputFormatter(format, false)
        const result = formatter.formatWorkspaceInfo(mockWorkspaceInfo)
        expect(result).toMatchSnapshot()
      })
    })

    it('should format workspace info without catalog names', () => {
      const infoWithoutCatalogs: WorkspaceInfo = {
        ...mockWorkspaceInfo,
        catalogNames: [],
      }
      const formatter = new OutputFormatter('table', false)
      const result = formatter.formatWorkspaceInfo(infoWithoutCatalogs)
      expect(result).toMatchSnapshot()
    })
  })

  describe('formatWorkspaceStats', () => {
    formats.forEach((format) => {
      it(`should format workspace stats as ${format}`, () => {
        const formatter = new OutputFormatter(format, false)
        const result = formatter.formatWorkspaceStats(mockWorkspaceStats)
        expect(result).toMatchSnapshot()
      })
    })
  })

  describe('formatValidationReport', () => {
    formats.forEach((format) => {
      it(`should format valid report as ${format}`, () => {
        const formatter = new OutputFormatter(format, false)
        const result = formatter.formatValidationReport(mockValidationReport)
        expect(result).toMatchSnapshot()
      })
    })

    it('should format invalid validation report', () => {
      const formatter = new OutputFormatter('table', false)
      const result = formatter.formatValidationReport(mockInvalidValidationReport)
      expect(result).toMatchSnapshot()
    })
  })

  describe('formatMessage', () => {
    it('should format success message', () => {
      const formatter = new OutputFormatter('table', false)
      const result = formatter.formatMessage('Operation completed', 'success')
      expect(result).toBe('Operation completed')
    })

    it('should format error message', () => {
      const formatter = new OutputFormatter('table', false)
      const result = formatter.formatMessage('Something went wrong', 'error')
      expect(result).toBe('Something went wrong')
    })

    it('should format warning message', () => {
      const formatter = new OutputFormatter('table', false)
      const result = formatter.formatMessage('Please review', 'warning')
      expect(result).toBe('Please review')
    })

    it('should format info message', () => {
      const formatter = new OutputFormatter('table', false)
      const result = formatter.formatMessage('FYI', 'info')
      expect(result).toBe('FYI')
    })
  })

  describe('constructor defaults', () => {
    it('should use table format by default', () => {
      const formatter = new OutputFormatter()
      const result = formatter.formatWorkspaceInfo(mockWorkspaceInfo)
      // Table format includes box-drawing characters
      expect(result).toContain('│')
    })

    it('should accept color option', () => {
      // Note: Color output depends on terminal capabilities and environment
      // We test that the color option is accepted without error
      const formatterWithColor = new OutputFormatter('table', true)
      const formatterWithoutColor = new OutputFormatter('table', false)
      const resultWithColor = formatterWithColor.formatMessage('test', 'success')
      const resultWithoutColor = formatterWithoutColor.formatMessage('test', 'success')
      // Both should produce valid output
      expect(resultWithColor).toBe('test')
      expect(resultWithoutColor).toBe('test')
    })
  })

  describe('JSON output', () => {
    it('should produce valid JSON', () => {
      const formatter = new OutputFormatter('json', false)
      const result = formatter.formatOutdatedReport(mockOutdatedReport)
      expect(() => JSON.parse(result)).not.toThrow()
    })

    it('should include all data in JSON', () => {
      const formatter = new OutputFormatter('json', false)
      const result = formatter.formatOutdatedReport(mockOutdatedReport)
      const parsed = JSON.parse(result)
      expect(parsed.workspace.name).toBe('test-workspace')
      expect(parsed.totalOutdated).toBe(3)
      expect(parsed.catalogs).toHaveLength(1)
    })
  })

  describe('YAML output', () => {
    it('should produce valid YAML structure', () => {
      const formatter = new OutputFormatter('yaml', false)
      const result = formatter.formatOutdatedReport(mockOutdatedReport)
      expect(result).toContain('workspace:')
      expect(result).toContain('name: test-workspace')
    })
  })
})
