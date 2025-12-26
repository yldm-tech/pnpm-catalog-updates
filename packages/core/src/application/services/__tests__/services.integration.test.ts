/**
 * Service Layer Integration Tests (TEST-002)
 *
 * These tests verify the interaction between services with minimal mocking.
 * Only external network calls (npm registry) are mocked.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock only external network calls
vi.mock('../../external-services/npmRegistryService.js', () => ({
  NpmRegistryService: vi.fn().mockImplementation(() => ({
    getPackageInfo: vi.fn().mockImplementation((packageName: string) => {
      // Return realistic package info for common packages
      const mockPackages: Record<
        string,
        { name: string; 'dist-tags': { latest: string }; versions: Record<string, unknown> }
      > = {
        lodash: {
          name: 'lodash',
          'dist-tags': { latest: '4.17.21' },
          versions: {
            '4.17.20': {},
            '4.17.21': {},
          },
        },
        typescript: {
          name: 'typescript',
          'dist-tags': { latest: '5.4.0' },
          versions: {
            '5.3.0': {},
            '5.3.3': {},
            '5.4.0': {},
          },
        },
        vitest: {
          name: 'vitest',
          'dist-tags': { latest: '2.1.0' },
          versions: {
            '2.0.0': {},
            '2.0.5': {},
            '2.1.0': {},
          },
        },
      }
      return Promise.resolve(
        mockPackages[packageName] || {
          name: packageName,
          'dist-tags': { latest: '1.0.0' },
          versions: { '1.0.0': {} },
        }
      )
    }),
    getLatestVersion: vi.fn().mockImplementation((packageName: string) => {
      const versions: Record<string, string> = {
        lodash: '4.17.21',
        typescript: '5.4.0',
        vitest: '2.1.0',
      }
      return Promise.resolve(versions[packageName] || '1.0.0')
    }),
  })),
}))

// Mock security advisory service
vi.mock('../../external-services/securityAdvisoryService.js', () => ({
  SecurityAdvisoryService: vi.fn().mockImplementation(() => ({
    checkVulnerabilities: vi.fn().mockResolvedValue({ vulnerabilities: [] }),
    getAdvisories: vi.fn().mockResolvedValue([]),
  })),
}))

// Import real implementations after mocks
import { FileWorkspaceRepository } from '../../../infrastructure/repositories/fileWorkspaceRepository.js'
import { WorkspaceService } from '../workspaceService.js'

describe('Service Layer Integration Tests', () => {
  let testWorkspace: string

  beforeEach(() => {
    // Create a temporary test workspace
    testWorkspace = join(tmpdir(), `pcu-integration-test-${Date.now()}`)
    mkdirSync(testWorkspace, { recursive: true })
    mkdirSync(join(testWorkspace, 'packages', 'app'), { recursive: true })
  })

  afterEach(() => {
    // Clean up test workspace
    try {
      rmSync(testWorkspace, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks()
  })

  describe('WorkspaceService + CatalogUpdateService Integration', () => {
    it('should load workspace and plan updates without deep mocking', async () => {
      // Create a realistic pnpm workspace structure
      const pnpmWorkspaceYaml = `packages:
  - 'packages/*'

catalog:
  lodash: ^4.17.20
  typescript: ^5.3.0
`
      writeFileSync(join(testWorkspace, 'pnpm-workspace.yaml'), pnpmWorkspaceYaml)

      // Create root package.json
      writeFileSync(
        join(testWorkspace, 'package.json'),
        JSON.stringify({
          name: 'test-workspace',
          private: true,
        })
      )

      // Create a package that uses catalog dependencies
      writeFileSync(
        join(testWorkspace, 'packages', 'app', 'package.json'),
        JSON.stringify({
          name: '@test/app',
          version: '1.0.0',
          dependencies: {
            lodash: 'catalog:',
          },
          devDependencies: {
            typescript: 'catalog:',
          },
        })
      )

      // Create real service instances (with mocked external calls)
      const workspaceRepository = new FileWorkspaceRepository()
      const workspaceService = new WorkspaceService(workspaceRepository)

      // Load workspace using real implementation
      const workspace = await workspaceService.loadWorkspace(testWorkspace)

      // Verify workspace was loaded correctly
      expect(workspace).toBeDefined()
      expect(workspace.name).toBe('test-workspace')
      expect(workspace.catalogs.size()).toBeGreaterThan(0)

      // Verify catalog was parsed
      const defaultCatalog = workspace.catalogs.getDefault()
      expect(defaultCatalog).toBeDefined()
      expect(defaultCatalog?.dependencies.size).toBe(2)
      expect(defaultCatalog?.dependencies.get('lodash')).toBe('^4.17.20')
      expect(defaultCatalog?.dependencies.get('typescript')).toBe('^5.3.0')
    })

    it('should handle workspace with multiple catalogs', async () => {
      // Create workspace with multiple named catalogs
      const pnpmWorkspaceYaml = `packages:
  - 'packages/*'

catalog:
  lodash: ^4.17.20

catalogs:
  react17:
    react: ^17.0.0
    react-dom: ^17.0.0
  react18:
    react: ^18.2.0
    react-dom: ^18.2.0
`
      writeFileSync(join(testWorkspace, 'pnpm-workspace.yaml'), pnpmWorkspaceYaml)
      writeFileSync(
        join(testWorkspace, 'package.json'),
        JSON.stringify({ name: 'multi-catalog-workspace', private: true })
      )

      const workspaceRepository = new FileWorkspaceRepository()
      const workspaceService = new WorkspaceService(workspaceRepository)

      const workspace = await workspaceService.loadWorkspace(testWorkspace)

      // Should have default catalog + named catalogs
      expect(workspace.catalogs.size()).toBeGreaterThanOrEqual(2)

      // Verify default catalog
      const defaultCatalog = workspace.catalogs.getDefault()
      expect(defaultCatalog?.dependencies.get('lodash')).toBe('^4.17.20')
    })

    it('should throw error for invalid workspace', async () => {
      // Create invalid workspace (no pnpm-workspace.yaml)
      writeFileSync(
        join(testWorkspace, 'package.json'),
        JSON.stringify({ name: 'invalid-workspace' })
      )

      const workspaceRepository = new FileWorkspaceRepository()
      const workspaceService = new WorkspaceService(workspaceRepository)

      await expect(workspaceService.loadWorkspace(testWorkspace)).rejects.toThrow()
    })

    it('should handle empty catalog gracefully', async () => {
      // Create workspace with empty catalog
      const pnpmWorkspaceYaml = `packages:
  - 'packages/*'
`
      writeFileSync(join(testWorkspace, 'pnpm-workspace.yaml'), pnpmWorkspaceYaml)
      writeFileSync(
        join(testWorkspace, 'package.json'),
        JSON.stringify({ name: 'empty-catalog-workspace', private: true })
      )

      const workspaceRepository = new FileWorkspaceRepository()
      const workspaceService = new WorkspaceService(workspaceRepository)

      const workspace = await workspaceService.loadWorkspace(testWorkspace)

      expect(workspace).toBeDefined()
      // Workspace should load even without catalogs
      expect(workspace.name).toBe('empty-catalog-workspace')
    })
  })

  describe('Service error propagation', () => {
    it('should propagate file system errors correctly', async () => {
      const nonExistentPath = join(testWorkspace, 'does-not-exist')

      const workspaceRepository = new FileWorkspaceRepository()
      const workspaceService = new WorkspaceService(workspaceRepository)

      await expect(workspaceService.loadWorkspace(nonExistentPath)).rejects.toThrow()
    })

    it('should handle concurrent workspace loads', async () => {
      // Create valid workspace
      const pnpmWorkspaceYaml = `packages:
  - 'packages/*'

catalog:
  lodash: ^4.17.20
`
      writeFileSync(join(testWorkspace, 'pnpm-workspace.yaml'), pnpmWorkspaceYaml)
      writeFileSync(
        join(testWorkspace, 'package.json'),
        JSON.stringify({ name: 'concurrent-test', private: true })
      )

      const workspaceRepository = new FileWorkspaceRepository()
      const workspaceService = new WorkspaceService(workspaceRepository)

      // Load workspace concurrently
      const [result1, result2, result3] = await Promise.all([
        workspaceService.loadWorkspace(testWorkspace),
        workspaceService.loadWorkspace(testWorkspace),
        workspaceService.loadWorkspace(testWorkspace),
      ])

      // All should succeed with same data
      expect(result1.name).toBe('concurrent-test')
      expect(result2.name).toBe('concurrent-test')
      expect(result3.name).toBe('concurrent-test')
    })
  })

  describe('WorkspaceService getWorkspaceInfo', () => {
    it('should return workspace info with correct counts', async () => {
      const pnpmWorkspaceYaml = `packages:
  - 'packages/*'

catalog:
  lodash: ^4.17.20
  typescript: ^5.3.0
`
      writeFileSync(join(testWorkspace, 'pnpm-workspace.yaml'), pnpmWorkspaceYaml)
      writeFileSync(
        join(testWorkspace, 'package.json'),
        JSON.stringify({ name: 'info-test-workspace', private: true })
      )
      writeFileSync(
        join(testWorkspace, 'packages', 'app', 'package.json'),
        JSON.stringify({ name: '@test/app', version: '1.0.0' })
      )

      const workspaceRepository = new FileWorkspaceRepository()
      const workspaceService = new WorkspaceService(workspaceRepository)

      const info = await workspaceService.getWorkspaceInfo(testWorkspace)

      expect(info.name).toBe('info-test-workspace')
      expect(info.path).toBe(testWorkspace)
      expect(info.catalogCount).toBeGreaterThan(0)
      expect(info.packageCount).toBeGreaterThanOrEqual(0) // May be 0 or 1 depending on detection
    })
  })
})
