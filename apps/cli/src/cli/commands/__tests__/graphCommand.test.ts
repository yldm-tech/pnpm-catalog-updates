/**
 * Graph Command Tests
 */

import type { WorkspaceService } from '@pcu/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphFormat, GraphType } from '../graphCommand.js'

// Use vi.hoisted for mock values
const mocks = vi.hoisted(() => ({
  cliOutputPrint: vi.fn(),
  getCatalogs: vi.fn(),
  getPackages: vi.fn(),
}))

// Mock @pcu/utils
vi.mock('@pcu/utils', () => ({
  CommandExitError: class CommandExitError extends Error {
    exitCode: number
    constructor(message: string, exitCode = 0) {
      super(message)
      this.exitCode = exitCode
    }
    static success() {
      return new CommandExitError('success', 0)
    }
  },
}))

// Mock cliOutput
vi.mock('../../utils/cliOutput.js', () => ({
  cliOutput: {
    print: mocks.cliOutputPrint,
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock validators
vi.mock('../../validators/index.js', () => ({
  errorsOnly: (fn: (opts: unknown) => { errors: string[] }) => (opts: unknown) => fn(opts).errors,
  validateGraphOptions: (opts: { format?: string; type?: string }) => {
    const errors: string[] = []
    if (opts.format && !['text', 'mermaid', 'dot', 'json'].includes(opts.format)) {
      errors.push(`Invalid format: ${opts.format}`)
    }
    if (opts.type && !['catalog', 'package', 'full'].includes(opts.type)) {
      errors.push(`Invalid type: ${opts.type}`)
    }
    return { errors, warnings: [] }
  },
}))

// Import after mock setup
const { GraphCommand } = await import('../graphCommand.js')

describe('GraphCommand', () => {
  let command: InstanceType<typeof GraphCommand>
  let mockWorkspaceService: {
    getCatalogs: ReturnType<typeof vi.fn>
    getPackages: ReturnType<typeof vi.fn>
  }

  const mockCatalogs = [
    {
      name: 'default',
      packageCount: 3,
      mode: 'default',
      packages: ['react', 'lodash', 'typescript'],
    },
    {
      name: 'dev',
      packageCount: 2,
      mode: 'dev',
      packages: ['vitest', 'eslint'],
    },
  ]

  const mockPackages = [
    {
      name: 'app',
      path: 'packages/app',
      dependencies: [
        { name: 'react', type: 'dependencies', isCatalogReference: true },
        { name: 'lodash', type: 'dependencies', isCatalogReference: true },
      ],
      catalogReferences: [{ catalogName: 'default', dependencyType: 'dependencies' }],
    },
    {
      name: 'utils',
      path: 'packages/utils',
      dependencies: [{ name: 'typescript', type: 'devDependencies', isCatalogReference: true }],
      catalogReferences: [{ catalogName: 'dev', dependencyType: 'devDependencies' }],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    mockWorkspaceService = {
      getCatalogs: mocks.getCatalogs,
      getPackages: mocks.getPackages,
    }

    mocks.getCatalogs.mockResolvedValue(mockCatalogs)
    mocks.getPackages.mockResolvedValue(mockPackages)

    command = new GraphCommand(mockWorkspaceService as unknown as WorkspaceService)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('execute', () => {
    it('should output text format by default', async () => {
      await expect(command.execute({})).rejects.toThrow('success')

      expect(mocks.cliOutputPrint).toHaveBeenCalled()
      const output = mocks.cliOutputPrint.mock.calls[0][0]
      expect(output).toContain('Catalog Dependency Graph')
      expect(output).toContain('Catalogs:')
    })

    it('should output mermaid format when specified', async () => {
      await expect(command.execute({ format: 'mermaid' })).rejects.toThrow('success')

      expect(mocks.cliOutputPrint).toHaveBeenCalled()
      const output = mocks.cliOutputPrint.mock.calls[0][0]
      expect(output).toContain('```mermaid')
      expect(output).toContain('graph TD')
      expect(output).toContain('```')
    })

    it('should output dot format when specified', async () => {
      await expect(command.execute({ format: 'dot' })).rejects.toThrow('success')

      expect(mocks.cliOutputPrint).toHaveBeenCalled()
      const output = mocks.cliOutputPrint.mock.calls[0][0]
      expect(output).toContain('digraph CatalogDependencies')
      expect(output).toContain('rankdir=TB')
    })

    it('should output json format when specified', async () => {
      await expect(command.execute({ format: 'json' })).rejects.toThrow('success')

      expect(mocks.cliOutputPrint).toHaveBeenCalled()
      const output = mocks.cliOutputPrint.mock.calls[0][0]
      const parsed = JSON.parse(output)
      expect(parsed).toHaveProperty('nodes')
      expect(parsed).toHaveProperty('edges')
    })

    it('should build catalog graph type by default', async () => {
      await expect(command.execute({ format: 'json' })).rejects.toThrow('success')

      const output = mocks.cliOutputPrint.mock.calls[0][0]
      const parsed = JSON.parse(output)

      const catalogNodes = parsed.nodes.filter((n: { type: string }) => n.type === 'catalog')
      expect(catalogNodes.length).toBe(2)
      expect(catalogNodes.map((n: { name: string }) => n.name)).toContain('default')
      expect(catalogNodes.map((n: { name: string }) => n.name)).toContain('dev')
    })

    it('should build package graph type when specified', async () => {
      await expect(command.execute({ format: 'json', type: 'package' })).rejects.toThrow('success')

      const output = mocks.cliOutputPrint.mock.calls[0][0]
      const parsed = JSON.parse(output)

      const packageNodes = parsed.nodes.filter((n: { type: string }) => n.type === 'package')
      expect(packageNodes.length).toBe(2)
      expect(packageNodes.map((n: { name: string }) => n.name)).toContain('app')
      expect(packageNodes.map((n: { name: string }) => n.name)).toContain('utils')
    })

    it('should build full graph type when specified', async () => {
      await expect(command.execute({ format: 'json', type: 'full' })).rejects.toThrow('success')

      const output = mocks.cliOutputPrint.mock.calls[0][0]
      const parsed = JSON.parse(output)

      const catalogNodes = parsed.nodes.filter((n: { type: string }) => n.type === 'catalog')
      const packageNodes = parsed.nodes.filter((n: { type: string }) => n.type === 'package')
      expect(catalogNodes.length).toBeGreaterThan(0)
      expect(packageNodes.length).toBeGreaterThan(0)
    })

    it('should filter by catalog when specified', async () => {
      await expect(command.execute({ format: 'json', catalog: 'default' })).rejects.toThrow(
        'success'
      )

      const output = mocks.cliOutputPrint.mock.calls[0][0]
      const parsed = JSON.parse(output)

      const catalogNodes = parsed.nodes.filter((n: { type: string }) => n.type === 'catalog')
      expect(catalogNodes.length).toBe(1)
      expect(catalogNodes[0].name).toBe('default')
    })

    it('should fetch catalogs and packages in parallel', async () => {
      await expect(command.execute({})).rejects.toThrow('success')

      expect(mocks.getCatalogs).toHaveBeenCalled()
      expect(mocks.getPackages).toHaveBeenCalled()
    })

    it('should handle empty catalogs', async () => {
      mocks.getCatalogs.mockResolvedValue([])
      mocks.getPackages.mockResolvedValue([])

      await expect(command.execute({ format: 'json' })).rejects.toThrow('success')

      const output = mocks.cliOutputPrint.mock.calls[0][0]
      const parsed = JSON.parse(output)
      expect(parsed.nodes).toEqual([])
      expect(parsed.edges).toEqual([])
    })

    it('should respect color option in text format', async () => {
      await expect(command.execute({ format: 'text', color: false })).rejects.toThrow('success')

      expect(mocks.cliOutputPrint).toHaveBeenCalled()
      // With color=false, output should not contain ANSI escape codes
      const output = mocks.cliOutputPrint.mock.calls[0][0]
      expect(output).not.toMatch(/\x1b\[/)
    })
  })

  describe('graph formatting', () => {
    it('should generate valid mermaid syntax with node classes', async () => {
      await expect(command.execute({ format: 'mermaid' })).rejects.toThrow('success')

      const output = mocks.cliOutputPrint.mock.calls[0][0]
      expect(output).toContain('classDef catalog')
      expect(output).toContain('classDef package')
      expect(output).toContain('classDef dependency')
    })

    it('should generate valid DOT syntax with node styles', async () => {
      await expect(command.execute({ format: 'dot' })).rejects.toThrow('success')

      const output = mocks.cliOutputPrint.mock.calls[0][0]
      expect(output).toContain('shape=box')
      expect(output).toContain('fillcolor=')
    })

    it('should include edge relationships in all formats', async () => {
      // Test mermaid edges
      await expect(command.execute({ format: 'mermaid', type: 'full' })).rejects.toThrow('success')
      let output = mocks.cliOutputPrint.mock.calls[0][0]
      expect(output).toMatch(/--->/i) // contains arrow

      // Test dot edges
      mocks.cliOutputPrint.mockClear()
      await expect(command.execute({ format: 'dot', type: 'full' })).rejects.toThrow('success')
      output = mocks.cliOutputPrint.mock.calls[0][0]
      expect(output).toContain('->')
    })
  })

  describe('validateOptions', () => {
    it('should return empty array for valid options', () => {
      const errors = GraphCommand.validateOptions({
        format: 'json',
        type: 'catalog',
      })
      expect(errors).toEqual([])
    })

    it('should return error for invalid format', () => {
      const errors = GraphCommand.validateOptions({
        format: 'invalid' as GraphFormat,
      })
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toContain('format')
    })

    it('should return error for invalid type', () => {
      const errors = GraphCommand.validateOptions({
        type: 'invalid' as GraphType,
      })
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toContain('type')
    })
  })

  describe('getHelpText', () => {
    it('should return help text with all options', () => {
      const helpText = GraphCommand.getHelpText()

      expect(helpText).toContain('Visualize catalog dependency relationships')
      expect(helpText).toContain('--format')
      expect(helpText).toContain('--type')
      expect(helpText).toContain('--catalog')
      expect(helpText).toContain('text')
      expect(helpText).toContain('mermaid')
      expect(helpText).toContain('dot')
      expect(helpText).toContain('json')
    })

    it('should include examples', () => {
      const helpText = GraphCommand.getHelpText()

      expect(helpText).toContain('Examples:')
      expect(helpText).toContain('pcu graph')
    })
  })
})
