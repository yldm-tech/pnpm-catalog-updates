/**
 * E2E Tests for pcu CLI
 *
 * These tests verify the CLI works correctly with real project structures.
 * They use a temporary workspace with realistic pnpm configuration.
 */

import { execSync, type SpawnOptionsWithoutStdio, spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Path to the built CLI
const CLI_PATH = join(__dirname, '../../dist/index.js')

// Timeout for CLI commands (30 seconds)
const CLI_TIMEOUT = 30000

/**
 * Execute CLI command and return output
 */
function runCli(
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd: options.cwd,
      env: { ...process.env, ...options.env, NO_COLOR: '1' },
      timeout: options.timeout || CLI_TIMEOUT,
    }

    const child = spawn('node', [CLI_PATH, ...args], spawnOptions)

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

/**
 * Execute CLI command synchronously (for simpler assertions)
 */
function runCliSync(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const result = execSync(`node ${CLI_PATH} ${args.join(' ')}`, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env, NO_COLOR: '1' },
      encoding: 'utf-8',
      timeout: CLI_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { stdout: result, stderr: '', exitCode: 0 }
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      exitCode: execError.status ?? 1,
    }
  }
}

describe('pcu CLI E2E Tests', () => {
  let testWorkspace: string

  beforeAll(() => {
    // Create a temporary test workspace
    testWorkspace = join(tmpdir(), `pcu-e2e-test-${Date.now()}`)
    mkdirSync(testWorkspace, { recursive: true })

    // Create a realistic pnpm workspace structure
    const pnpmWorkspaceYaml = `packages:
  - 'packages/*'

catalog:
  lodash: ^4.17.21
  typescript: ^5.3.0
  vitest: ^2.0.0
`

    const packageJson = {
      name: 'test-workspace',
      private: true,
      packageManager: 'pnpm@9.0.0',
      devDependencies: {
        typescript: 'catalog:',
        vitest: 'catalog:',
      },
      dependencies: {
        lodash: 'catalog:',
      },
    }

    const subPackageJson = {
      name: '@test/sub-package',
      version: '1.0.0',
      dependencies: {
        lodash: 'catalog:',
      },
    }

    // Write workspace files
    writeFileSync(join(testWorkspace, 'pnpm-workspace.yaml'), pnpmWorkspaceYaml)
    writeFileSync(join(testWorkspace, 'package.json'), JSON.stringify(packageJson, null, 2))

    // Create sub-package
    mkdirSync(join(testWorkspace, 'packages', 'sub-package'), { recursive: true })
    writeFileSync(
      join(testWorkspace, 'packages', 'sub-package', 'package.json'),
      JSON.stringify(subPackageJson, null, 2)
    )

    // Create .npmrc for registry config
    writeFileSync(join(testWorkspace, '.npmrc'), 'registry=https://registry.npmjs.org/\n')
  })

  afterAll(() => {
    // Clean up test workspace
    rmSync(testWorkspace, { recursive: true, force: true })
  })

  describe('--help', () => {
    it('should display help information', async () => {
      const result = await runCli(['--help'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('pcu')
      expect(result.stdout).toContain('check')
      expect(result.stdout).toContain('update')
      expect(result.stdout).toContain('analyze')
      expect(result.stdout).toContain('workspace')
      expect(result.stdout).toContain('security')
      expect(result.stdout).toContain('graph')
    })

    it('should display version', async () => {
      const result = await runCli(['--version'])

      expect(result.exitCode).toBe(0)
      // Should contain a semver version
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
    })
  })

  describe('check command', () => {
    it('should check for outdated dependencies', async () => {
      const result = await runCli(['check', '--format', 'json'], {
        cwd: testWorkspace,
      })

      // Should succeed or exit with code 0/1 (depending on outdated packages)
      expect([0, 1]).toContain(result.exitCode)

      // Output should be valid JSON when using --format json
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow()
      }
    })

    it('should support --catalog filter', async () => {
      const result = await runCli(['check', '--catalog', 'default'], {
        cwd: testWorkspace,
      })

      // Should not throw errors
      expect(result.exitCode).toBeLessThanOrEqual(1)
    })

    it('should support --include and --exclude patterns', async () => {
      const result = await runCli(['check', '--include', 'lodash', '--exclude', 'typescript'], {
        cwd: testWorkspace,
      })

      expect(result.exitCode).toBeLessThanOrEqual(1)
    })
  })

  describe('workspace command', () => {
    it('should display workspace info', async () => {
      const result = await runCli(['workspace', '--info'], {
        cwd: testWorkspace,
      })

      expect(result.exitCode).toBe(0)
      // Check for workspace statistics output format
      expect(result.stdout).toContain('Workspace')
    })

    it('should validate workspace', async () => {
      const result = await runCli(['workspace', '--validate'], {
        cwd: testWorkspace,
      })

      expect(result.exitCode).toBe(0)
    })

    it('should support JSON format', async () => {
      const result = await runCli(['workspace', '--info', '--format', 'json'], {
        cwd: testWorkspace,
      })

      expect(result.exitCode).toBe(0)
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow()
      }
    })
  })

  describe('theme command', () => {
    it('should list available themes', async () => {
      const result = await runCli(['theme', '--list'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('default')
    })
  })

  describe('graph command', () => {
    it('should display dependency graph in text format', async () => {
      const result = await runCli(['graph'], {
        cwd: testWorkspace,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Catalog')
    })

    it('should support --format json', async () => {
      const result = await runCli(['graph', '--format', 'json'], {
        cwd: testWorkspace,
      })

      expect(result.exitCode).toBe(0)
      const parsed = JSON.parse(result.stdout)
      expect(parsed).toHaveProperty('nodes')
      expect(parsed).toHaveProperty('edges')
    })

    it('should support --format mermaid', async () => {
      const result = await runCli(['graph', '--format', 'mermaid'], {
        cwd: testWorkspace,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('graph TD')
      expect(result.stdout).toContain('mermaid')
    })

    it('should support --format dot', async () => {
      const result = await runCli(['graph', '--format', 'dot'], {
        cwd: testWorkspace,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('digraph')
    })

    it('should support --type option', async () => {
      const result = await runCli(['graph', '--type', 'full'], {
        cwd: testWorkspace,
      })

      expect(result.exitCode).toBe(0)
    })
  })

  describe('update command (dry-run)', () => {
    it('should perform dry-run update', async () => {
      const result = await runCli(['update', '--dry-run', '--no-ai'], {
        cwd: testWorkspace,
      })

      // Should succeed (dry-run doesn't modify files)
      expect([0, 1]).toContain(result.exitCode)
    })

    it('should support --format json in dry-run', async () => {
      const result = await runCli(['update', '--dry-run', '--no-ai', '--format', 'json'], {
        cwd: testWorkspace,
      })

      expect([0, 1]).toContain(result.exitCode)
    })
  })

  describe('error handling', () => {
    it('should handle non-existent workspace gracefully', async () => {
      // Use temp directory (exists but has no pnpm-workspace.yaml)
      const result = await runCli(['check'], {
        cwd: tmpdir(),
      })

      expect(result.exitCode).not.toBe(0)
    })

    it('should handle invalid command gracefully', async () => {
      const result = await runCli(['invalid-command'])

      expect(result.exitCode).not.toBe(0)
    })

    it('should handle invalid options gracefully', async () => {
      const result = await runCli(['check', '--invalid-option'])

      expect(result.exitCode).not.toBe(0)
    })
  })

  describe('output formats', () => {
    const formats = ['table', 'json', 'yaml', 'minimal']

    formats.forEach((format) => {
      it(`should support --format ${format}`, async () => {
        const result = await runCli(['check', '--format', format], {
          cwd: testWorkspace,
        })

        // Should not crash regardless of format
        expect([0, 1]).toContain(result.exitCode)
      })
    })
  })

  describe('global options', () => {
    it('should respect --no-color option', async () => {
      const result = await runCli(['check', '--no-color'], {
        cwd: testWorkspace,
      })

      // Output should not contain ANSI color codes
      expect(result.stdout).not.toMatch(/\x1b\[\d+m/)
    })

    it('should respect --verbose option', async () => {
      const result = await runCli(['check', '--verbose'], {
        cwd: testWorkspace,
      })

      expect([0, 1]).toContain(result.exitCode)
    })

    it('should respect --workspace option', async () => {
      const result = await runCli(['check', '--workspace', testWorkspace])

      expect([0, 1]).toContain(result.exitCode)
    })
  })
})
