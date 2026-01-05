/**
 * Graph Command
 *
 * CLI command to visualize catalog dependency relationships.
 * Supports multiple output formats: text, mermaid, dot, json.
 */

import type { WorkspaceService } from '@pcu/core'
import { CommandExitError } from '@pcu/utils'
import chalk from 'chalk'
import { cliOutput } from '../utils/cliOutput.js'
import { errorsOnly, validateGraphOptions } from '../validators/index.js'

export type GraphFormat = 'text' | 'mermaid' | 'dot' | 'json'
export type GraphType = 'catalog' | 'package' | 'full'

export interface GraphCommandOptions {
  workspace?: string
  format?: GraphFormat
  type?: GraphType
  catalog?: string
  verbose?: boolean
  color?: boolean
}

interface GraphNode {
  id: string
  type: 'catalog' | 'package' | 'dependency'
  name: string
  metadata?: Record<string, unknown>
}

interface GraphEdge {
  source: string
  target: string
  type: 'contains' | 'uses' | 'depends'
  label?: string
}

interface DependencyGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export class GraphCommand {
  constructor(private readonly workspaceService: WorkspaceService) {}

  /**
   * Execute the graph command
   */
  async execute(options: GraphCommandOptions = {}): Promise<void> {
    const format = options.format || 'text'
    const graphType = options.type || 'catalog'
    const useColor = options.color !== false

    // Build the dependency graph
    const graph = await this.buildGraph(options.workspace, graphType, options.catalog)

    // Output in requested format
    const output = this.formatGraph(graph, format, useColor)
    cliOutput.print(output)

    throw CommandExitError.success()
  }

  /**
   * Build the dependency graph from workspace data
   */
  private async buildGraph(
    workspacePath?: string,
    graphType: GraphType = 'catalog',
    catalogFilter?: string
  ): Promise<DependencyGraph> {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []

    // PERF-001: Parallel fetch for independent async operations
    const [catalogs, packages] = await Promise.all([
      this.workspaceService.getCatalogs(workspacePath),
      this.workspaceService.getPackages(workspacePath),
    ])

    // Filter catalogs if specified
    const filteredCatalogs = catalogFilter
      ? catalogs.filter((c) => c.name === catalogFilter)
      : catalogs

    if (graphType === 'catalog' || graphType === 'full') {
      // Add catalog nodes
      for (const catalog of filteredCatalogs) {
        nodes.push({
          id: `catalog:${catalog.name}`,
          type: 'catalog',
          name: catalog.name,
          metadata: {
            packageCount: catalog.packageCount,
            mode: catalog.mode,
          },
        })

        // Add dependency nodes for catalog entries
        for (const pkgName of catalog.packages) {
          const depId = `dep:${pkgName}`
          if (!nodes.find((n) => n.id === depId)) {
            nodes.push({
              id: depId,
              type: 'dependency',
              name: pkgName,
            })
          }

          edges.push({
            source: `catalog:${catalog.name}`,
            target: depId,
            type: 'contains',
          })
        }
      }
    }

    if (graphType === 'package' || graphType === 'full') {
      // Add package nodes
      for (const pkg of packages) {
        nodes.push({
          id: `package:${pkg.name}`,
          type: 'package',
          name: pkg.name,
          metadata: {
            path: pkg.path,
            dependencyCount: pkg.dependencies.length,
          },
        })

        // Add edges for catalog references
        for (const ref of pkg.catalogReferences) {
          if (!catalogFilter || ref.catalogName === catalogFilter) {
            edges.push({
              source: `package:${pkg.name}`,
              target: `catalog:${ref.catalogName}`,
              type: 'uses',
              label: ref.dependencyType,
            })
          }
        }

        // Add edges for dependencies (in full mode)
        if (graphType === 'full') {
          for (const dep of pkg.dependencies) {
            if (dep.isCatalogReference) {
              // Link to the dependency node if it exists
              const depId = `dep:${dep.name}`
              if (nodes.find((n) => n.id === depId)) {
                edges.push({
                  source: `package:${pkg.name}`,
                  target: depId,
                  type: 'depends',
                  label: dep.type,
                })
              }
            }
          }
        }
      }
    }

    return { nodes, edges }
  }

  /**
   * Format the graph for output
   */
  private formatGraph(graph: DependencyGraph, format: GraphFormat, useColor: boolean): string {
    switch (format) {
      case 'mermaid':
        return this.formatMermaid(graph)
      case 'dot':
        return this.formatDot(graph)
      case 'json':
        return this.formatJson(graph)
      default:
        return this.formatText(graph, useColor)
    }
  }

  /**
   * Format as text-based tree
   */
  private formatText(graph: DependencyGraph, useColor: boolean): string {
    const lines: string[] = []
    const c = useColor
      ? chalk
      : {
          cyan: (s: string) => s,
          green: (s: string) => s,
          yellow: (s: string) => s,
          gray: (s: string) => s,
          bold: (s: string) => s,
        }

    lines.push(c.bold('Catalog Dependency Graph'))
    lines.push('')

    // Group by catalogs
    const catalogNodes = graph.nodes.filter((n) => n.type === 'catalog')
    const packageNodes = graph.nodes.filter((n) => n.type === 'package')

    if (catalogNodes.length > 0) {
      lines.push(c.cyan('📦 Catalogs:'))

      for (const catalog of catalogNodes) {
        const meta = catalog.metadata || {}
        lines.push(
          `  ${c.bold(catalog.name)} (${meta.packageCount || 0} packages, mode: ${meta.mode || 'default'})`
        )

        // Find dependencies contained in this catalog
        const containedEdges = graph.edges.filter(
          (e) => e.source === catalog.id && e.type === 'contains'
        )
        for (const edge of containedEdges) {
          const depNode = graph.nodes.find((n) => n.id === edge.target)
          if (depNode) {
            lines.push(`    ├─ ${c.yellow(depNode.name)}`)
          }
        }

        // Find packages using this catalog
        const usingEdges = graph.edges.filter((e) => e.target === catalog.id && e.type === 'uses')
        if (usingEdges.length > 0) {
          lines.push(`  ${c.gray('Used by packages:')}`)
          for (const edge of usingEdges) {
            const pkgNode = graph.nodes.find((n) => n.id === edge.source)
            if (pkgNode) {
              lines.push(`    └─ ${c.green(pkgNode.name)} (${edge.label || 'dependencies'})`)
            }
          }
        }
        lines.push('')
      }
    }

    if (packageNodes.length > 0 && catalogNodes.length === 0) {
      lines.push(c.green('📁 Packages:'))

      for (const pkg of packageNodes) {
        const meta = pkg.metadata || {}
        lines.push(`  ${c.bold(pkg.name)}`)
        lines.push(`    ${c.gray(`Path: ${meta.path || 'unknown'}`)}`)

        // Find catalog references
        const usesEdges = graph.edges.filter((e) => e.source === pkg.id && e.type === 'uses')
        if (usesEdges.length > 0) {
          lines.push(`    ${c.gray('Uses catalogs:')}`)
          for (const edge of usesEdges) {
            const catalogNode = graph.nodes.find((n) => n.id === edge.target)
            if (catalogNode) {
              lines.push(`      └─ ${c.cyan(catalogNode.name)} (${edge.label || 'dependencies'})`)
            }
          }
        }
        lines.push('')
      }
    }

    // Summary
    lines.push(c.gray('─'.repeat(40)))
    lines.push(`Nodes: ${graph.nodes.length} | Edges: ${graph.edges.length}`)

    return lines.join('\n')
  }

  /**
   * Format as Mermaid diagram
   */
  private formatMermaid(graph: DependencyGraph): string {
    const lines: string[] = []
    lines.push('```mermaid')
    lines.push('graph TD')

    // Add nodes with styling
    for (const node of graph.nodes) {
      const shape = this.getMermaidShape(node.type)
      lines.push(`    ${this.sanitizeId(node.id)}${shape[0]}"${node.name}"${shape[1]}`)
    }

    lines.push('')

    // Add edges
    for (const edge of graph.edges) {
      const arrow = this.getMermaidArrow(edge.type)
      const label = edge.label ? `|${edge.label}|` : ''
      lines.push(
        `    ${this.sanitizeId(edge.source)} ${arrow}${label} ${this.sanitizeId(edge.target)}`
      )
    }

    lines.push('')

    // Add styling
    lines.push('    classDef catalog fill:#e1f5fe,stroke:#01579b')
    lines.push('    classDef package fill:#e8f5e9,stroke:#2e7d32')
    lines.push('    classDef dependency fill:#fff3e0,stroke:#e65100')

    // Apply classes
    const catalogIds = graph.nodes
      .filter((n) => n.type === 'catalog')
      .map((n) => this.sanitizeId(n.id))
    const packageIds = graph.nodes
      .filter((n) => n.type === 'package')
      .map((n) => this.sanitizeId(n.id))
    const depIds = graph.nodes
      .filter((n) => n.type === 'dependency')
      .map((n) => this.sanitizeId(n.id))

    if (catalogIds.length > 0) lines.push(`    class ${catalogIds.join(',')} catalog`)
    if (packageIds.length > 0) lines.push(`    class ${packageIds.join(',')} package`)
    if (depIds.length > 0) lines.push(`    class ${depIds.join(',')} dependency`)

    lines.push('```')

    return lines.join('\n')
  }

  /**
   * Format as DOT (Graphviz)
   */
  private formatDot(graph: DependencyGraph): string {
    const lines: string[] = []
    lines.push('digraph CatalogDependencies {')
    lines.push('    rankdir=TB;')
    lines.push('    node [fontname="Arial"];')
    lines.push('')

    // Add nodes with styling
    for (const node of graph.nodes) {
      const style = this.getDotStyle(node.type)
      lines.push(`    "${node.id}" [label="${node.name}" ${style}];`)
    }

    lines.push('')

    // Add edges
    for (const edge of graph.edges) {
      const style = this.getDotEdgeStyle(edge.type)
      const label = edge.label ? ` label="${edge.label}"` : ''
      lines.push(`    "${edge.source}" -> "${edge.target}" [${style}${label}];`)
    }

    lines.push('}')

    return lines.join('\n')
  }

  /**
   * Format as JSON
   */
  private formatJson(graph: DependencyGraph): string {
    return JSON.stringify(graph, null, 2)
  }

  /**
   * Get Mermaid shape for node type
   */
  private getMermaidShape(type: string): [string, string] {
    switch (type) {
      case 'catalog':
        return ['[/', '/]'] // Parallelogram
      case 'package':
        return ['([', '])'] // Stadium/pill shape
      case 'dependency':
        return ['((', '))'] // Circle
      default:
        return ['[', ']']
    }
  }

  /**
   * Get Mermaid arrow for edge type
   */
  private getMermaidArrow(type: string): string {
    switch (type) {
      case 'contains':
        return '--->'
      case 'uses':
        return '==>'
      case 'depends':
        return '-.->'
      default:
        return '-->'
    }
  }

  /**
   * Get DOT style for node type
   */
  private getDotStyle(type: string): string {
    switch (type) {
      case 'catalog':
        return 'shape=box style=filled fillcolor="#e1f5fe"'
      case 'package':
        return 'shape=ellipse style=filled fillcolor="#e8f5e9"'
      case 'dependency':
        return 'shape=circle style=filled fillcolor="#fff3e0"'
      default:
        return ''
    }
  }

  /**
   * Get DOT style for edge type
   */
  private getDotEdgeStyle(type: string): string {
    switch (type) {
      case 'contains':
        return 'style=solid'
      case 'uses':
        return 'style=bold color=blue'
      case 'depends':
        return 'style=dashed'
      default:
        return ''
    }
  }

  /**
   * Sanitize ID for Mermaid (remove special characters)
   */
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_')
  }

  /**
   * Validate command options
   * QUAL-002: Uses unified validator from validators/
   */
  static validateOptions(options: GraphCommandOptions): string[] {
    return errorsOnly(validateGraphOptions)(options)
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Visualize catalog dependency relationships

Usage:
  pcu graph [options]

Options:
  -f, --format <type>   Output format: text, mermaid, dot, json (default: text)
  -t, --type <type>     Graph type: catalog, package, full (default: catalog)
  --catalog <name>      Filter by specific catalog
  --verbose             Show detailed information

Graph Types:
  catalog   Show catalogs and their contained dependencies
  package   Show packages and their catalog references
  full      Show complete dependency graph

Output Formats:
  text      Human-readable text tree
  mermaid   Mermaid diagram (for Markdown/documentation)
  dot       DOT format (for Graphviz)
  json      JSON structure (for programmatic use)

Examples:
  pcu graph                        # Show catalog dependency tree
  pcu graph --type full            # Show complete dependency graph
  pcu graph --format mermaid       # Output as Mermaid diagram
  pcu graph --catalog default      # Show only default catalog
  pcu graph --format dot > deps.dot && dot -Tpng deps.dot -o deps.png
    `
  }
}
