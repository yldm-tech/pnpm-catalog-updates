/**
 * Changelog Handler
 *
 * Handles changelog fetching and display for the update command.
 */

import { ChangelogService, NpmRegistryService, type UpdatePlan } from '@pcu/core'
import { logger, t } from '@pcu/utils'
import chalk from 'chalk'
import { cliOutput } from '../utils/cliOutput.js'

/**
 * Handles changelog display for package updates
 */
export class ChangelogHandler {
  private readonly changelogService: ChangelogService
  private readonly npmRegistry: NpmRegistryService

  constructor() {
    this.changelogService = new ChangelogService({ cacheMinutes: 30 })
    this.npmRegistry = new NpmRegistryService()
  }

  /**
   * Display changelogs for all planned updates
   */
  async displayChangelogs(plan: UpdatePlan, verbose?: boolean): Promise<void> {
    cliOutput.print(chalk.blue(`\n📋 ${t('command.update.fetchingChangelogs')}`))

    for (const update of plan.updates) {
      await this.displayPackageChangelog(
        update.packageName,
        update.currentVersion,
        update.newVersion,
        verbose
      )
    }

    cliOutput.print(chalk.gray(`\n${'─'.repeat(60)}`))
  }

  /**
   * Display changelog for a single package
   */
  private async displayPackageChangelog(
    packageName: string,
    currentVersion: string,
    newVersion: string,
    verbose?: boolean
  ): Promise<void> {
    try {
      // Get package info to find repository URL
      const packageInfo = await this.npmRegistry.getPackageInfo(packageName)
      const repository = this.extractRepository(packageInfo.repository)

      // Fetch changelog between versions
      const changelog = await this.changelogService.getChangelog(
        packageName,
        currentVersion,
        newVersion,
        repository
      )

      // Display formatted changelog
      cliOutput.print(chalk.yellow(`\n📦 ${packageName}`))
      cliOutput.print(chalk.gray(`   ${currentVersion} → ${newVersion}`))
      cliOutput.print(this.changelogService.formatChangelog(changelog, verbose))
    } catch (error) {
      logger.debug('Failed to fetch changelog', {
        package: packageName,
        error: error instanceof Error ? error.message : String(error),
      })
      this.displayFallbackInfo(packageName, currentVersion, newVersion)
    }
  }

  /**
   * Extract repository info from package.json repository field
   */
  private extractRepository(repository: unknown): { type: string; url: string } | undefined {
    if (!repository) return undefined

    if (typeof repository === 'string') {
      return { type: 'git', url: repository }
    }

    if (typeof repository === 'object' && repository !== null) {
      const repo = repository as { type?: string; url?: string }
      if (repo.url) {
        return { type: repo.type || 'git', url: repo.url }
      }
    }

    return undefined
  }

  /**
   * Display fallback info when changelog is not available
   */
  private displayFallbackInfo(
    packageName: string,
    currentVersion: string,
    newVersion: string
  ): void {
    cliOutput.print(chalk.yellow(`\n📦 ${packageName}`))
    cliOutput.print(chalk.gray(`   ${currentVersion} → ${newVersion}`))
    cliOutput.print(
      chalk.gray(
        `   📋 ${t('command.update.changelogUnavailable')}: https://www.npmjs.com/package/${packageName}?activeTab=versions`
      )
    )
  }
}
