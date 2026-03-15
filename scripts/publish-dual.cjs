#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const CLI_PACKAGE_PATH = path.join(__dirname, '../apps/cli/package.json')
const WORKSPACE_PATH = path.join(__dirname, '../pnpm-workspace.yaml')
const isDryRun = process.argv.includes('--dry-run')

function runCommand(command, options = {}) {
  console.log(`${isDryRun ? '[DRY RUN] ' : ''}Running: ${command}`)

  if (isDryRun && !options.alwaysRun) {
    console.log('[DRY RUN] Command skipped')
    return
  }

  try {
    execSync(command, { stdio: 'inherit' })
  } catch (error) {
    console.error(`Command failed: ${command}`)
    console.error(`Error: ${error.message}`)
    throw error
  }
}

function isAlreadyPublished(packageName, version) {
  try {
    execSync(`npm view "${packageName}@${version}" version --json`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return true
  } catch (error) {
    const stderr = error.stderr?.toString() ?? ''
    const stdout = error.stdout?.toString() ?? ''
    const output = `${stdout}\n${stderr}`

    if (output.includes('E404') || output.includes('404')) {
      return false
    }

    throw error
  }
}

function updatePackageName(newName) {
  const packageJson = JSON.parse(fs.readFileSync(CLI_PACKAGE_PATH, 'utf8'))
  packageJson.name = newName
  fs.writeFileSync(CLI_PACKAGE_PATH, `${JSON.stringify(packageJson, null, 2)}\n`)
  console.log(`Updated package name to: ${newName}`)
}

function resolveCatalogDependencies() {
  console.log('\n🔄 Resolving catalog dependencies...')

  // Read package.json
  const packageJson = JSON.parse(fs.readFileSync(CLI_PACKAGE_PATH, 'utf8'))

  // Get actual installed versions using pnpm list
  let pnpmList
  try {
    const output = execSync('pnpm list --json --filter=pcu', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    pnpmList = JSON.parse(output)
  } catch (error) {
    console.warn('⚠️ Could not get pnpm list, falling back to manual resolution')
    // Fallback to basic catalog resolution
    const catalog = {
      '@clack/prompts': '^0.10.0',
      '@inquirer/core': '^10.1.10',
      boxen: '^8.0.1',
      chalk: '5.4.1',
      'cli-table3': '0.6.5',
      commander: '14.0.0',
      'fs-extra': '11.3.0',
      glob: '11.0.3',
      inquirer: '12.7.0',
      lodash: '^4.17.21',
      'npm-registry-fetch': '18.0.2',
      ora: '8.2.0',
      pacote: '21.0.0',
      rxjs: '7.8.2',
      semver: '7.7.2',
      yaml: '2.8.0',
    }

    // Resolve dependencies
    const resolvedDependencies = {}
    for (const [dep, version] of Object.entries(packageJson.dependencies || {})) {
      // Skip workspace dependencies (they're bundled by tsup)
      if (version.startsWith('workspace:')) {
        console.log(`  ${dep}: ${version} → removed (bundled)`)
        continue
      }
      if (version === 'catalog:') {
        if (catalog[dep]) {
          resolvedDependencies[dep] = catalog[dep]
          console.log(`  ${dep}: catalog: → ${catalog[dep]}`)
        } else {
          console.warn(`  ⚠️ ${dep}: catalog entry not found, keeping original`)
          resolvedDependencies[dep] = version
        }
      } else {
        resolvedDependencies[dep] = version
      }
    }

    // Keep devDependencies as is for publishing (they won't be installed anyway)
    packageJson.dependencies = resolvedDependencies

    fs.writeFileSync(CLI_PACKAGE_PATH, `${JSON.stringify(packageJson, null, 2)}\n`)
    console.log('✅ Catalog dependencies resolved using fallback')
    return packageJson
  }

  // Extract versions from pnpm list output
  const installedDeps = {}
  if (pnpmList?.[0]?.dependencies) {
    for (const [dep, info] of Object.entries(pnpmList[0].dependencies)) {
      installedDeps[dep] = info.version
    }
  }

  // Resolve dependencies
  const resolvedDependencies = {}
  for (const [dep, version] of Object.entries(packageJson.dependencies || {})) {
    // Skip workspace dependencies (they're bundled by tsup)
    if (version.startsWith('workspace:')) {
      console.log(`  ${dep}: ${version} → removed (bundled)`)
      continue
    }
    if (version === 'catalog:') {
      if (installedDeps[dep]) {
        resolvedDependencies[dep] = `^${installedDeps[dep]}`
        console.log(`  ${dep}: catalog: → ^${installedDeps[dep]}`)
      } else {
        console.warn(`  ⚠️ ${dep}: not found in installed deps, keeping original`)
        resolvedDependencies[dep] = version
      }
    } else {
      resolvedDependencies[dep] = version
    }
  }

  // Keep devDependencies as is for publishing (they won't be installed anyway)
  packageJson.dependencies = resolvedDependencies

  fs.writeFileSync(CLI_PACKAGE_PATH, `${JSON.stringify(packageJson, null, 2)}\n`)
  console.log('✅ Catalog dependencies resolved')

  return packageJson
}

async function publishDual() {
  // Read and backup original package.json BEFORE try block for proper restore on error
  const originalPackageContent = fs.readFileSync(CLI_PACKAGE_PATH, 'utf8')

  try {
    console.log(`${isDryRun ? '[DRY RUN] ' : ''}Starting dual package publication...`)

    // Build first
    console.log('\n📦 Building packages...')
    runCommand('pnpm build', { alwaysRun: true })
    const originalPackage = JSON.parse(originalPackageContent)
    const version = originalPackage.version
    const originalName = originalPackage.name

    // Resolve catalog dependencies for publishing
    resolveCatalogDependencies()

    console.log(`\n🚀 Publishing version ${version} as dual packages...`)

    const publishResults = []

    // First publish as 'pcu' (current name)
    console.log('\n1️⃣ Publishing as "pcu"...')
    if (isAlreadyPublished('pcu', version)) {
      console.log(`⏭️ Skipping pcu@${version}: already published`)
      publishResults.push({ name: 'pcu', status: 'skipped' })
    } else {
      const publishCommand1 = `cd apps/cli && npm publish${isDryRun ? ' --dry-run' : ''}`
      runCommand(publishCommand1, { alwaysRun: true })
      publishResults.push({ name: 'pcu', status: isDryRun ? 'dry-run' : 'published' })
    }

    // Then publish as 'pnpm-catalog-updates'
    console.log('\n2️⃣ Publishing as "pnpm-catalog-updates"...')
    updatePackageName('pnpm-catalog-updates')
    if (isAlreadyPublished('pnpm-catalog-updates', version)) {
      console.log(`⏭️ Skipping pnpm-catalog-updates@${version}: already published`)
      publishResults.push({ name: 'pnpm-catalog-updates', status: 'skipped' })
    } else {
      const publishCommand2 = `cd apps/cli && npm publish${isDryRun ? ' --dry-run' : ''}`
      runCommand(publishCommand2, { alwaysRun: true })
      publishResults.push({
        name: 'pnpm-catalog-updates',
        status: isDryRun ? 'dry-run' : 'published',
      })
    }

    // Restore original package.json (with catalog dependencies)
    console.log('\n🔄 Restoring original package.json...')
    fs.writeFileSync(CLI_PACKAGE_PATH, originalPackageContent)
    console.log('✅ Restored original package.json with catalog dependencies')

    const status = isDryRun ? 'tested' : 'completed'
    console.log(`\n✅ Dual publication ${status} successfully!`)
    console.log(`📦 Publication results for ${version}:`)
    for (const result of publishResults) {
      console.log(`   - ${result.name}@${version} (${result.status})`)
    }
  } catch (error) {
    console.error('\n❌ Publication failed:', error.message)

    // Ensure we restore the original package.json even if publication fails
    try {
      fs.writeFileSync(CLI_PACKAGE_PATH, originalPackageContent)
      console.log('🔄 Restored original package.json after failure')
    } catch (restoreError) {
      console.error('⚠️ Failed to restore package.json:', restoreError.message)
    }

    process.exit(1)
  }
}

publishDual()
