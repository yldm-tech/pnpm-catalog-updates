/**
 * Changelog Service
 *
 * Provides access to package changelog and release notes.
 * Fetches from GitHub API for GitHub-hosted packages, with fallback to npm.
 */

import { UserFriendlyErrorHandler } from '@pcu/utils'

export interface ChangelogEntry {
  version: string
  date?: string
  title?: string
  body?: string
  url?: string
  isPrerelease?: boolean
  breaking?: boolean
}

export interface PackageChangelog {
  packageName: string
  repository?: {
    type: string
    url: string
    owner?: string
    repo?: string
  }
  releases: ChangelogEntry[]
  changelogUrl?: string
  error?: string
}

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T
  timestamp: number
}

/**
 * GitHub release response structure
 */
interface GitHubRelease {
  tag_name: string
  name?: string
  body?: string
  published_at?: string
  html_url?: string
  prerelease?: boolean
}

/**
 * GitHub repository info for parsing URLs
 */
interface GitHubRepoInfo {
  owner: string
  repo: string
}

export class ChangelogService {
  private readonly cache: Map<string, CacheEntry<PackageChangelog>> = new Map()
  private readonly cacheTimeout: number

  constructor(options: { cacheMinutes?: number } = {}) {
    this.cacheTimeout = (options.cacheMinutes ?? 30) * 60 * 1000
  }

  /**
   * Get changelog for a package between two versions
   */
  async getChangelog(
    packageName: string,
    fromVersion: string,
    toVersion: string,
    repository?: { type?: string; url?: string }
  ): Promise<PackageChangelog> {
    const cacheKey = `${packageName}:${fromVersion}:${toVersion}`

    // Check cache first
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      return cached
    }

    const changelog: PackageChangelog = {
      packageName,
      releases: [],
    }

    // Parse repository info
    if (repository?.url) {
      changelog.repository = {
        type: repository.type || 'git',
        url: repository.url,
      }

      const githubInfo = this.parseGitHubUrl(repository.url)
      if (githubInfo) {
        changelog.repository.owner = githubInfo.owner
        changelog.repository.repo = githubInfo.repo
        changelog.changelogUrl = `https://github.com/${githubInfo.owner}/${githubInfo.repo}/releases`

        // Try to fetch GitHub releases
        try {
          const releases = await this.fetchGitHubReleases(
            githubInfo.owner,
            githubInfo.repo,
            fromVersion,
            toVersion
          )
          changelog.releases = releases
        } catch (error) {
          // Log but don't fail - we'll show the URL instead
          UserFriendlyErrorHandler.handlePackageQueryFailure(packageName, error as Error, {
            operation: 'changelog-fetch',
          })
          changelog.error = 'Unable to fetch releases from GitHub'
        }
      }
    }

    // If no GitHub releases, provide npm link
    if (changelog.releases.length === 0 && !changelog.changelogUrl) {
      changelog.changelogUrl = `https://www.npmjs.com/package/${packageName}?activeTab=versions`
    }

    // Cache the result
    this.setCache(cacheKey, changelog)

    return changelog
  }

  /**
   * Parse GitHub repository URL to extract owner and repo
   */
  private parseGitHubUrl(url: string): GitHubRepoInfo | null {
    // Handle various GitHub URL formats:
    // https://github.com/owner/repo
    // https://github.com/owner/repo.git
    // git://github.com/owner/repo.git
    // git+https://github.com/owner/repo.git
    // github:owner/repo
    // git@github.com:owner/repo.git

    const patterns = [/github\.com[/:]([^/]+)\/([^/.]+)/, /github:([^/]+)\/([^/.]+)/]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match?.[1] && match[2]) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, ''),
        }
      }
    }

    return null
  }

  /**
   * Fetch GitHub releases between two versions
   */
  private async fetchGitHubReleases(
    owner: string,
    repo: string,
    fromVersion: string,
    toVersion: string
  ): Promise<ChangelogEntry[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases`

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'pcu-catalog-updates',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Repository ${owner}/${repo} not found or no releases available`)
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const releases = (await response.json()) as GitHubRelease[]

    // Filter releases between the two versions
    const fromNormalized = this.normalizeVersion(fromVersion)
    const toNormalized = this.normalizeVersion(toVersion)

    const relevantReleases = releases.filter((release) => {
      const tagVersion = this.normalizeVersion(release.tag_name)
      return this.isVersionInRange(tagVersion, fromNormalized, toNormalized)
    })

    // Convert to ChangelogEntry format
    return relevantReleases.map((release) => {
      const body = release.body || ''
      const hasBreaking =
        body.toLowerCase().includes('breaking') || body.toLowerCase().includes('breaking change')

      return {
        version: this.normalizeVersion(release.tag_name),
        date: release.published_at
          ? new Date(release.published_at).toISOString().split('T')[0]
          : undefined,
        title: release.name || release.tag_name,
        body: this.truncateBody(body, 500),
        url: release.html_url,
        isPrerelease: release.prerelease,
        breaking: hasBreaking,
      }
    })
  }

  /**
   * Normalize version string (remove v prefix, etc.)
   */
  private normalizeVersion(version: string): string {
    return version.replace(/^v/, '').trim()
  }

  /**
   * Check if a version is in the range (exclusive of from, inclusive of to)
   */
  private isVersionInRange(version: string, from: string, to: string): boolean {
    // Simple semver comparison
    const vParts = version.split('.').map((p) => parseInt(p, 10) || 0)
    const fromParts = from.split('.').map((p) => parseInt(p, 10) || 0)
    const toParts = to.split('.').map((p) => parseInt(p, 10) || 0)

    // Ensure all arrays have 3 elements
    while (vParts.length < 3) vParts.push(0)
    while (fromParts.length < 3) fromParts.push(0)
    while (toParts.length < 3) toParts.push(0)

    const vNum = vParts[0]! * 1000000 + vParts[1]! * 1000 + vParts[2]!
    const fromNum = fromParts[0]! * 1000000 + fromParts[1]! * 1000 + fromParts[2]!
    const toNum = toParts[0]! * 1000000 + toParts[1]! * 1000 + toParts[2]!

    // Version should be > from and <= to
    return vNum > fromNum && vNum <= toNum
  }

  /**
   * Truncate body text to a maximum length
   */
  private truncateBody(body: string, maxLength: number): string {
    if (body.length <= maxLength) {
      return body
    }
    return `${body.substring(0, maxLength - 3)}...`
  }

  /**
   * Get item from cache if not expired
   */
  private getFromCache(key: string): PackageChangelog | null {
    const cached = this.cache.get(key)
    if (!cached) {
      return null
    }

    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  /**
   * Set item in cache
   */
  private setCache(key: string, data: PackageChangelog): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Format changelog for console output
   */
  formatChangelog(changelog: PackageChangelog, verbose: boolean = false): string {
    const lines: string[] = []

    if (changelog.releases.length === 0) {
      if (changelog.changelogUrl) {
        lines.push(`📋 Changelog: ${changelog.changelogUrl}`)
      }
      if (changelog.error) {
        lines.push(`⚠️  ${changelog.error}`)
      }
      return lines.join('\n')
    }

    lines.push(`📋 Releases (${changelog.releases.length}):`)

    for (const release of changelog.releases) {
      const icon = release.breaking ? '⚠️' : release.isPrerelease ? '🔬' : '📦'
      const date = release.date ? ` (${release.date})` : ''
      lines.push(`  ${icon} ${release.version}${date}`)

      if (release.title && release.title !== release.version) {
        lines.push(`     ${release.title}`)
      }

      if (verbose && release.body) {
        // Indent and format the body
        const bodyLines = release.body.split('\n').slice(0, 5)
        for (const bodyLine of bodyLines) {
          if (bodyLine.trim()) {
            lines.push(`     ${bodyLine.trim()}`)
          }
        }
        if (release.body.split('\n').length > 5) {
          lines.push(`     ...`)
        }
      }

      if (release.url) {
        lines.push(`     🔗 ${release.url}`)
      }
    }

    if (changelog.changelogUrl) {
      lines.push(`\n📖 Full changelog: ${changelog.changelogUrl}`)
    }

    return lines.join('\n')
  }
}
