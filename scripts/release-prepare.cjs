#!/usr/bin/env node

/**
 * Release Preparation Script
 *
 * Usage:
 *   node scripts/release-prepare.cjs patch|minor|major
 *
 * This script:
 * 1. Bumps version in apps/cli/package.json
 * 2. Updates CHANGELOG.md with unreleased changes
 * 3. Outputs the new version for tagging
 */

const fs = require('node:fs')
const path = require('node:path')

const CLI_PACKAGE_PATH = path.join(__dirname, '../apps/cli/package.json')
const CHANGELOG_PATH = path.join(__dirname, '../apps/cli/CHANGELOG.md')

function bumpVersion(currentVersion, type) {
  const [major, minor, patch] = currentVersion.split('.').map(Number)

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(`Invalid version type: ${type}. Use: patch, minor, or major`)
  }
}

function updateChangelog(newVersion) {
  const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8')
  const today = new Date().toISOString().split('T')[0]

  // Replace "## Unreleased" with the new version
  const updatedChangelog = changelog.replace(/## Unreleased/, `## ${newVersion} (${today})`)

  if (updatedChangelog === changelog) {
    console.log('⚠️  No "## Unreleased" section found in CHANGELOG.md')
    return false
  }

  fs.writeFileSync(CHANGELOG_PATH, updatedChangelog)
  return true
}

function main() {
  const type = process.argv[2]

  if (!type || !['patch', 'minor', 'major'].includes(type)) {
    console.error('Usage: node scripts/release-prepare.cjs <patch|minor|major>')
    console.error('')
    console.error('Examples:')
    console.error('  node scripts/release-prepare.cjs patch   # 1.1.0 → 1.1.1')
    console.error('  node scripts/release-prepare.cjs minor   # 1.1.0 → 1.2.0')
    console.error('  node scripts/release-prepare.cjs major   # 1.1.0 → 2.0.0')
    process.exit(1)
  }

  // Read current version
  const packageJson = JSON.parse(fs.readFileSync(CLI_PACKAGE_PATH, 'utf8'))
  const currentVersion = packageJson.version
  const newVersion = bumpVersion(currentVersion, type)

  console.log(`\n📦 Preparing release...`)
  console.log(`   Version: ${currentVersion} → ${newVersion} (${type})`)

  // Update package.json
  packageJson.version = newVersion
  fs.writeFileSync(CLI_PACKAGE_PATH, `${JSON.stringify(packageJson, null, 2)}\n`)
  console.log(`   ✅ Updated apps/cli/package.json`)

  // Update CHANGELOG
  if (updateChangelog(newVersion)) {
    console.log(`   ✅ Updated apps/cli/CHANGELOG.md`)
  }

  console.log(`\n🎉 Release v${newVersion} prepared!`)
  console.log(`\nNext steps:`)
  console.log(`   git add -A && git commit -m "chore: release v${newVersion}"`)
  console.log(`   pnpm tag`)
  console.log(``)

  // Output version for scripting
  console.log(`NEW_VERSION=${newVersion}`)
}

main()
