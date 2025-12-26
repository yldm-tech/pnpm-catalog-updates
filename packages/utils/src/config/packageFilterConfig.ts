/**
 * PCU Configuration System
 *
 * Defines configuration types and provides default configuration.
 * User configuration can override any part of the default configuration.
 */

export interface PackageRule {
  patterns: string[]
  target?: 'latest' | 'greatest' | 'minor' | 'patch' | 'newest'
  autoUpdate?: boolean
  requireConfirmation?: boolean
  groupUpdate?: boolean
  relatedPackages?: string[] // 相关包会自动遵循相同的版本策略
}

export interface SecurityConfig {
  autoFixVulnerabilities?: boolean
  allowMajorForSecurity?: boolean
  notifyOnSecurityUpdate?: boolean
  /** Cache security check results for this many minutes (default: 60) */
  cacheMinutes?: number
  /** Enable security vulnerability checks (default: true) */
  enableCheck?: boolean
}

export interface DefaultsConfig {
  target?: 'latest' | 'greatest' | 'minor' | 'patch' | 'newest'
  includePrerelease?: boolean
  interactive?: boolean
  dryRun?: boolean
  createBackup?: boolean
  format?: 'table' | 'json' | 'yaml' | 'minimal'
}

export interface AdvancedConfig {
  concurrency?: number
  timeout?: number
  retries?: number
  cacheValidityMinutes?: number
  checkForUpdates?: boolean
  /** NPM registry URL (default: https://registry.npmjs.org/) */
  registry?: string
  /** NPM downloads API base URL (default: https://api.npmjs.org) */
  npmDownloadsApiUrl?: string
  /** Rate limit for API requests per second (default: 15) */
  rateLimit?: number
}

export interface MonorepoConfig {
  syncVersions?: string[]
  catalogPriority?: string[]
}

export interface PackageFilterConfig {
  /** UI locale: en, zh, ja, ko, de, fr, es */
  locale?: 'en' | 'zh' | 'ja' | 'ko' | 'de' | 'fr' | 'es'
  exclude?: string[]
  include?: string[]
  defaults?: DefaultsConfig
  packageRules?: PackageRule[]
  security?: SecurityConfig
  advanced?: AdvancedConfig
  monorepo?: MonorepoConfig
}

/**
 * Type for default config (locale is optional, others required)
 */
export type DefaultPackageFilterConfig = Omit<Required<PackageFilterConfig>, 'locale'> &
  Pick<PackageFilterConfig, 'locale'>

/**
 * Default built-in configuration
 */
export const DEFAULT_PACKAGE_FILTER_CONFIG: DefaultPackageFilterConfig = {
  exclude: [],
  include: [],
  defaults: {
    target: 'latest',
    includePrerelease: false,
    interactive: false,
    dryRun: false,
    createBackup: false,
    format: 'table',
  },
  packageRules: [
    // React ecosystem - keep types in sync with main packages
    {
      patterns: ['react', 'react-dom'],
      target: 'minor',
      autoUpdate: false,
      requireConfirmation: true,
      groupUpdate: true,
      relatedPackages: ['@types/react', '@types/react-dom'],
    },
    // Vue ecosystem
    {
      patterns: ['vue'],
      target: 'minor',
      autoUpdate: false,
      requireConfirmation: true,
      groupUpdate: false,
      relatedPackages: ['@vue/compiler-sfc', '@vue/runtime-core'],
    },
    // Node.js types - be conservative
    {
      patterns: ['@types/node'],
      target: 'minor',
      autoUpdate: false,
      requireConfirmation: true,
      groupUpdate: false,
    },
    // Other type definitions - can update more freely
    {
      patterns: ['@types/*'],
      target: 'latest',
      autoUpdate: true,
      requireConfirmation: false,
      groupUpdate: false,
    },
    // Dev tools - minor updates are usually safe
    {
      patterns: ['eslint*', 'prettier', '@typescript-eslint/*', 'vitest', 'jest'],
      target: 'minor',
      autoUpdate: false,
      requireConfirmation: false,
      groupUpdate: true,
    },
    // Build tools - be more conservative
    {
      patterns: ['typescript', 'webpack*', 'vite*', 'rollup*'],
      target: 'minor',
      autoUpdate: false,
      requireConfirmation: true,
      groupUpdate: false,
    },
  ],
  security: {
    autoFixVulnerabilities: true,
    allowMajorForSecurity: true,
    notifyOnSecurityUpdate: false,
    cacheMinutes: 60,
    enableCheck: true,
  },
  advanced: {
    concurrency: 5,
    timeout: 30000,
    retries: 3,
    cacheValidityMinutes: 60,
    checkForUpdates: true,
    npmDownloadsApiUrl: 'https://api.npmjs.org',
    rateLimit: 15,
  },
  monorepo: {
    syncVersions: [],
    catalogPriority: ['default'],
  },
}

/**
 * Configuration file names to look for
 */
export const CONFIG_FILE_NAMES = [
  '.pcurc.json',
  '.pcurc.js',
  '.pcurc.ts',
  'pcu.config.json',
  'pcu.config.js',
  'pcu.config.ts',
]
