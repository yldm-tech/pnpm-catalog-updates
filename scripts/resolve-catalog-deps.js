#!/usr/bin/env node

/**
 * Resolve Catalog Dependencies
 *
 * Resolves catalog: dependencies to actual version numbers.
 * Used for publishing to npm which doesn't support pnpm catalogs.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readCatalog,
  readPackageJson,
  resolveAllCatalogDeps,
  writePackageJson,
} from './lib/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

/**
 * Resolves catalog: dependencies to actual version numbers
 */
export async function resolveCatalogDependencies(packageJsonPath) {
  const targetPath = packageJsonPath || path.join(projectRoot, 'package.json')

  console.log('Resolving catalog dependencies...')

  // Read catalog definitions
  const catalog = await readCatalog(projectRoot)

  // Read and resolve package.json
  const packageJson = await readPackageJson(targetPath)
  const resolvedPackageJson = resolveAllCatalogDeps(packageJson, catalog)

  // Write the resolved package.json
  await writePackageJson(targetPath, resolvedPackageJson)

  console.log('\n[!] Successfully resolved all catalog dependencies')
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  resolveCatalogDependencies().catch((error) => {
    console.error('[X] Failed to resolve catalog dependencies:', error.message)
    process.exit(1)
  })
}
