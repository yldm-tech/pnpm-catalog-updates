#!/usr/bin/env node

/**
 * Publish Script
 *
 * Handles catalog dependencies resolution and changeset publishing.
 * Used by changesets/action in the release workflow.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec } from './lib/exec-utils.js'
import { withPackageJsonBackup } from './lib/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

/**
 * Publish script that handles catalog dependencies
 */
async function publish() {
  console.log('Starting publish process...')

  const packageJsonPath = path.join(projectRoot, 'package.json')

  try {
    await withPackageJsonBackup(packageJsonPath, async () => {
      // Resolve catalog dependencies
      console.log('Resolving catalog dependencies...')
      exec('node scripts/resolve-catalog-deps.js', { cwd: projectRoot })

      // Run changeset publish
      console.log('Publishing with changesets...')
      exec('pnpm changeset publish', { cwd: projectRoot })
    })

    console.log('[!] Successfully published package')
  } catch (error) {
    console.error('[X] Publish failed:', error.message)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  publish().catch(console.error)
}
