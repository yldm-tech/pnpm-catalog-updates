#!/usr/bin/env node

/**
 * Release Tag Script
 *
 * Usage:
 *   node scripts/release-tag.cjs
 *
 * This script:
 * 1. Reads version from apps/cli/package.json
 * 2. Creates a git tag (v{version})
 * 3. Pushes the tag to trigger release workflow
 */

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const CLI_PACKAGE_PATH = path.join(__dirname, '../apps/cli/package.json')

function run(cmd, options = {}) {
  console.log(`$ ${cmd}`)
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    })
  } catch (error) {
    if (!options.ignoreError) {
      throw error
    }
    return null
  }
}

function main() {
  // Check for uncommitted changes
  const status = run('git status --porcelain', { silent: true })
  if (status?.trim()) {
    console.error('❌ Error: You have uncommitted changes.')
    console.error('   Please commit your changes first:')
    console.error('   git add -A && git commit -m "chore: release vX.X.X"')
    process.exit(1)
  }

  // Read version
  const packageJson = JSON.parse(fs.readFileSync(CLI_PACKAGE_PATH, 'utf8'))
  const version = packageJson.version
  const tagName = `v${version}`

  console.log(`\n🏷️  Creating release tag...`)
  console.log(`   Version: ${version}`)
  console.log(`   Tag: ${tagName}`)

  // Check if tag already exists
  const existingTag = run(`git tag -l ${tagName}`, { silent: true })
  if (existingTag?.trim()) {
    console.error(`\n❌ Error: Tag ${tagName} already exists.`)
    console.error('   If you want to re-release, delete the tag first:')
    console.error(`   git tag -d ${tagName} && git push origin :refs/tags/${tagName}`)
    process.exit(1)
  }

  // Create tag
  console.log(`\n📝 Creating tag ${tagName}...`)
  run(`git tag -a ${tagName} -m "Release ${tagName}"`)

  // Push tag
  console.log(`\n🚀 Pushing tag to remote...`)
  run(`git push origin ${tagName}`)

  console.log(`\n✅ Release tag ${tagName} pushed successfully!`)
  console.log(`\n📋 GitHub Actions will now:`)
  console.log(`   1. Build the packages`)
  console.log(`   2. Publish to NPM (pcu & pnpm-catalog-updates)`)
  console.log(`   3. Create GitHub Release`)
  console.log(`\n🔗 Monitor at: https://github.com/houko/pnpm-catalog-updates/actions`)
}

main()
