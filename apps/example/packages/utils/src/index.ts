import chalk from 'chalk'
import { kebabCase } from 'lodash'

export function formatCatalogName(name: string) {
  return kebabCase(name)
}

export function highlightCatalog(name: string) {
  return chalk.cyan(formatCatalogName(name))
}

export function summarizeCatalogVersions(entries: Record<string, string>) {
  return Object.entries(entries).map(
    ([dependency, version]) => `${highlightCatalog(dependency)}@${version}`
  )
}
