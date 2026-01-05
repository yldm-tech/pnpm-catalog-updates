/**
 * ConfigLoader Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted for mock values
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readFile: vi.fn(),
  loggerWarn: vi.fn(),
  validateConfig: vi.fn(),
}))

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
}))

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
}))

// Mock logger
vi.mock('../../logger/logger.js', () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  Logger: {
    getLogger: vi.fn(() => ({
      warn: mocks.loggerWarn,
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    })),
  },
}))

// Mock validation
vi.mock('../../utils/validation.js', () => ({
  validatePackageFilterConfig: mocks.validateConfig,
}))

// Import after mock setup
const { ConfigLoader, configLoader } = await import('../configLoader.js')

describe('ConfigLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: validation passes
    mocks.validateConfig.mockReturnValue({ isValid: true, errors: [], warnings: [] })
    // Clear config cache between tests - both static and singleton caches
    ConfigLoader.clearCache()
    configLoader.clearCache()
  })

  describe('loadConfigSync', () => {
    it('should return default config when no config file exists', () => {
      mocks.existsSync.mockReturnValue(false)

      const config = configLoader.loadConfigSync('/test/workspace')

      expect(config.defaults).toBeDefined()
      expect(config.defaults?.target).toBe('latest')
    })

    it('should load and merge JSON config file', () => {
      mocks.existsSync.mockImplementation((path: string) => path.includes('.pcurc.json'))
      mocks.readFileSync.mockReturnValue(
        JSON.stringify({
          defaults: { target: 'minor' },
          exclude: ['lodash'],
        })
      )

      const config = configLoader.loadConfigSync('/test/workspace')

      expect(config.defaults?.target).toBe('minor')
      expect(config.exclude).toContain('lodash')
    })

    it('should use cached config on subsequent calls', () => {
      mocks.existsSync.mockReturnValue(false)

      const config1 = configLoader.loadConfigSync('/test/cache-test')
      const callsAfterFirst = mocks.existsSync.mock.calls.length

      const config2 = configLoader.loadConfigSync('/test/cache-test')
      const callsAfterSecond = mocks.existsSync.mock.calls.length

      expect(config1).toBe(config2)
      // existsSync should NOT be called again due to caching
      expect(callsAfterSecond).toBe(callsAfterFirst)
    })

    it('should skip JS/TS config files in sync mode', () => {
      mocks.existsSync.mockImplementation((path: string) => {
        if (path.includes('.pcurc.js') || path.includes('.pcurc.ts')) return true
        if (path.includes('.pcurc.json')) return true
        return false
      })
      mocks.readFileSync.mockReturnValue(JSON.stringify({ defaults: { target: 'patch' } }))

      const config = configLoader.loadConfigSync('/test/workspace')

      // Should load JSON, not JS/TS
      expect(config.defaults?.target).toBe('patch')
    })

    it('should throw ConfigurationError for invalid JSON syntax', () => {
      mocks.existsSync.mockImplementation((path: string) => path.includes('.pcurc.json'))
      mocks.readFileSync.mockReturnValue('{ invalid json }')

      expect(() => configLoader.loadConfigSync('/test/workspace')).toThrow()
    })

    it('should throw ConfigurationError for invalid config structure', () => {
      mocks.existsSync.mockImplementation((path: string) => path.includes('.pcurc.json'))
      mocks.readFileSync.mockReturnValue(JSON.stringify({ invalidKey: true }))
      mocks.validateConfig.mockReturnValue({
        isValid: false,
        errors: ['Invalid config structure'],
        warnings: [],
      })

      expect(() => configLoader.loadConfigSync('/test/workspace')).toThrow('Invalid configuration')
    })

    it('should log warnings for non-critical config issues', () => {
      mocks.existsSync.mockImplementation((path: string) => path.includes('.pcurc.json'))
      mocks.readFileSync.mockReturnValue(JSON.stringify({ defaults: { target: 'latest' } }))
      mocks.validateConfig.mockReturnValue({
        isValid: true,
        errors: [],
        warnings: ['Deprecated option used'],
      })

      configLoader.loadConfigSync('/test/workspace')

      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('Configuration warnings')
      )
    })
  })

  describe('loadConfig (async)', () => {
    it('should return default config when no config file exists', async () => {
      mocks.existsSync.mockReturnValue(false)

      const loader = new ConfigLoader()
      const config = await loader.loadConfig('/test/workspace')

      expect(config.defaults).toBeDefined()
      expect(config.defaults?.target).toBe('latest')
    })

    it('should load JSON config file asynchronously', async () => {
      mocks.existsSync.mockImplementation((path: string) => path.includes('.pcurc.json'))
      // PERF-002: Use async readFile mock for async method
      mocks.readFile.mockResolvedValue(
        JSON.stringify({
          defaults: { target: 'greatest' },
        })
      )

      const loader = new ConfigLoader()
      const config = await loader.loadConfig('/test/workspace')

      expect(config.defaults?.target).toBe('greatest')
    })

    it('should use cached config on subsequent async calls', async () => {
      mocks.existsSync.mockReturnValue(false)

      const loader = new ConfigLoader()
      const config1 = await loader.loadConfig('/test/workspace')
      const config2 = await loader.loadConfig('/test/workspace')

      expect(config1).toBe(config2)
    })

    it('should warn when dynamic config is skipped due to security', async () => {
      const uniquePath = '/test/dynamic-config-security-test'
      mocks.existsSync.mockImplementation((path: string) => {
        // Only .pcurc.js exists, no JSON config
        if (path.endsWith('.pcurc.js') && path.startsWith(uniquePath)) return true
        return false
      })

      const loader = new ConfigLoader()
      await loader.loadConfig(uniquePath)

      // Verify warn was called with security warning
      expect(mocks.loggerWarn).toHaveBeenCalled()
      const warnCalls = mocks.loggerWarn.mock.calls
      const hasSecurityWarning = warnCalls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('Security Warning')
      )
      expect(hasSecurityWarning).toBe(true)
    })
  })

  describe('clearCache', () => {
    it('should clear the config cache', () => {
      mocks.existsSync.mockReturnValue(false)

      const loader = new ConfigLoader()
      loader.loadConfigSync('/test/workspace')

      // Verify cache is used
      expect(loader.loadConfigSync('/test/workspace')).toBeDefined()

      // Clear cache
      loader.clearCache()

      // Should reload config
      loader.loadConfigSync('/test/workspace')

      // existsSync should be called again after cache clear
      expect(mocks.existsSync.mock.calls.length).toBeGreaterThan(1)
    })

    it('should clear static cache via static method', () => {
      mocks.existsSync.mockReturnValue(false)

      ConfigLoader.loadConfigSync('/test/workspace')
      ConfigLoader.clearCache()

      // After clear, should work without errors
      const config = ConfigLoader.loadConfigSync('/test/workspace')
      expect(config).toBeDefined()
    })
  })

  describe('getPackageConfig', () => {
    const baseConfig = {
      defaults: { target: 'latest' as const },
      exclude: ['excluded-pkg'],
      include: [],
      packageRules: [
        {
          patterns: ['@types/*'],
          target: 'patch' as const,
          requireConfirmation: true,
        },
        {
          patterns: ['react*'],
          target: 'minor' as const,
          autoUpdate: true,
        },
      ],
    }

    it('should return shouldUpdate: false for excluded packages', () => {
      const result = configLoader.getPackageConfig('excluded-pkg', baseConfig)

      expect(result.shouldUpdate).toBe(false)
    })

    it('should match package rules with wildcard patterns', () => {
      const result = configLoader.getPackageConfig('@types/node', baseConfig)

      expect(result.shouldUpdate).toBe(true)
      expect(result.target).toBe('patch')
      expect(result.requireConfirmation).toBe(true)
    })

    it('should match package rules with prefix wildcards', () => {
      const result = configLoader.getPackageConfig('react-dom', baseConfig)

      expect(result.shouldUpdate).toBe(true)
      expect(result.target).toBe('minor')
      expect(result.autoUpdate).toBe(true)
    })

    it('should return default config for unmatched packages', () => {
      const result = configLoader.getPackageConfig('lodash', baseConfig)

      expect(result.shouldUpdate).toBe(true)
      expect(result.target).toBe('latest')
      expect(result.requireConfirmation).toBe(false)
      expect(result.autoUpdate).toBe(false)
    })

    it('should respect include list when specified', () => {
      const configWithInclude = {
        ...baseConfig,
        include: ['allowed-*'],
      }

      const allowedResult = configLoader.getPackageConfig('allowed-pkg', configWithInclude)
      const notAllowedResult = configLoader.getPackageConfig('other-pkg', configWithInclude)

      expect(allowedResult.shouldUpdate).toBe(true)
      expect(notAllowedResult.shouldUpdate).toBe(false)
    })

    it('should handle relatedPackages in rules', () => {
      const configWithRelated = {
        defaults: { target: 'latest' as const },
        packageRules: [
          {
            patterns: ['react'],
            relatedPackages: ['react-dom', 'react-test-renderer'],
            target: 'minor' as const,
            groupUpdate: true,
          },
        ],
      }

      const result = configLoader.getPackageConfig('react-dom', configWithRelated)

      expect(result.shouldUpdate).toBe(true)
      expect(result.target).toBe('minor')
      expect(result.groupUpdate).toBe(true)
    })
  })

  describe('config merging', () => {
    it('should merge user config with defaults', () => {
      mocks.existsSync.mockImplementation((path: string) => path.includes('.pcurc.json'))
      mocks.readFileSync.mockReturnValue(
        JSON.stringify({
          defaults: { target: 'minor' },
          security: { checkVulnerabilities: false },
        })
      )

      const config = configLoader.loadConfigSync('/test/workspace')

      // User override
      expect(config.defaults?.target).toBe('minor')
      expect(config.security?.checkVulnerabilities).toBe(false)

      // Default values preserved
      expect(config.defaults?.createBackup).toBeDefined()
    })

    it('should concatenate exclude arrays', () => {
      mocks.existsSync.mockImplementation((path: string) => path.includes('.pcurc.json'))
      mocks.readFileSync.mockReturnValue(
        JSON.stringify({
          exclude: ['user-excluded-pkg'],
        })
      )

      const config = configLoader.loadConfigSync('/test/workspace')

      expect(config.exclude).toContain('user-excluded-pkg')
    })

    it('should merge packageRules with user rules taking priority', () => {
      mocks.existsSync.mockImplementation((path: string) => path.includes('.pcurc.json'))
      mocks.readFileSync.mockReturnValue(
        JSON.stringify({
          packageRules: [
            {
              patterns: ['custom-pkg'],
              target: 'patch',
            },
          ],
        })
      )

      const config = configLoader.loadConfigSync('/test/workspace')

      expect(config.packageRules).toBeDefined()
      expect(config.packageRules?.some((r) => r.patterns.includes('custom-pkg'))).toBe(true)
    })

    it('should handle locale from user config', () => {
      mocks.existsSync.mockImplementation((path: string) => path.includes('.pcurc.json'))
      mocks.readFileSync.mockReturnValue(
        JSON.stringify({
          locale: 'zh',
        })
      )

      const config = configLoader.loadConfigSync('/test/workspace')

      expect(config.locale).toBe('zh')
    })
  })

  describe('static methods backward compatibility', () => {
    it('should work with static loadConfigSync', () => {
      mocks.existsSync.mockReturnValue(false)

      const config = ConfigLoader.loadConfigSync('/test/workspace')

      expect(config).toBeDefined()
      expect(config.defaults).toBeDefined()
    })

    it('should work with static loadConfig', async () => {
      mocks.existsSync.mockReturnValue(false)

      const config = await ConfigLoader.loadConfig('/test/workspace')

      expect(config).toBeDefined()
      expect(config.defaults).toBeDefined()
    })

    it('should share cache between static and instance methods', () => {
      mocks.existsSync.mockReturnValue(false)

      // Load via static
      ConfigLoader.loadConfigSync('/test/workspace')

      // Clear via static (should clear instance cache too)
      ConfigLoader.clearCache()

      // Should work after clear
      const config = ConfigLoader.loadConfigSync('/test/workspace')
      expect(config).toBeDefined()
    })
  })

  describe('configLoader singleton', () => {
    it('should be an instance of ConfigLoader', () => {
      expect(configLoader).toBeDefined()
      expect(typeof configLoader.loadConfig).toBe('function')
      expect(typeof configLoader.loadConfigSync).toBe('function')
      expect(typeof configLoader.clearCache).toBe('function')
      expect(typeof configLoader.getPackageConfig).toBe('function')
    })

    it('should implement IConfigLoader interface', () => {
      // Verify all interface methods exist
      expect(configLoader.loadConfig).toBeDefined()
      expect(configLoader.loadConfigSync).toBeDefined()
      expect(configLoader.clearCache).toBeDefined()
      expect(configLoader.getPackageConfig).toBeDefined()
    })
  })

  describe('pattern matching', () => {
    it('should match exact package names', () => {
      const config = {
        defaults: { target: 'latest' as const },
        packageRules: [
          {
            patterns: ['lodash'],
            target: 'patch' as const,
          },
        ],
      }

      const result = configLoader.getPackageConfig('lodash', config)
      const otherResult = configLoader.getPackageConfig('lodash-es', config)

      expect(result.target).toBe('patch')
      expect(otherResult.target).toBe('latest') // Should not match lodash-es
    })

    it('should match wildcard at end', () => {
      const config = {
        defaults: { target: 'latest' as const },
        packageRules: [
          {
            patterns: ['eslint*'],
            target: 'minor' as const,
          },
        ],
      }

      const eslint = configLoader.getPackageConfig('eslint', config)
      const plugin = configLoader.getPackageConfig('eslint-plugin-react', config)

      expect(eslint.target).toBe('minor')
      expect(plugin.target).toBe('minor')
    })

    it('should match scoped packages with wildcard', () => {
      const config = {
        defaults: { target: 'latest' as const },
        packageRules: [
          {
            patterns: ['@babel/*'],
            target: 'patch' as const,
          },
        ],
      }

      const core = configLoader.getPackageConfig('@babel/core', config)
      const preset = configLoader.getPackageConfig('@babel/preset-env', config)
      const other = configLoader.getPackageConfig('@types/node', config)

      expect(core.target).toBe('patch')
      expect(preset.target).toBe('patch')
      expect(other.target).toBe('latest')
    })

    it('should be case insensitive', () => {
      const config = {
        defaults: { target: 'latest' as const },
        packageRules: [
          {
            patterns: ['React'],
            target: 'minor' as const,
          },
        ],
      }

      const result = configLoader.getPackageConfig('react', config)

      expect(result.target).toBe('minor')
    })
  })
})

describe('ConfigLoader isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateConfig.mockReturnValue({ isValid: true, errors: [], warnings: [] })
  })

  it('should provide isolated instances', () => {
    const loader1 = new ConfigLoader()
    const loader2 = new ConfigLoader()

    expect(loader1).not.toBe(loader2)
  })

  it('should have separate caches per instance', () => {
    mocks.existsSync.mockReturnValue(false)

    const loader1 = new ConfigLoader()
    const loader2 = new ConfigLoader()

    loader1.loadConfigSync('/path1')
    loader2.loadConfigSync('/path2')

    // Clear one instance's cache
    loader1.clearCache()

    // Loader2's cache should still work
    const config = loader2.loadConfigSync('/path2')
    expect(config).toBeDefined()
  })
})
