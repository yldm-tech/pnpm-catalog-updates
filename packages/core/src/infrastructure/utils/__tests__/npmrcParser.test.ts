import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  hasAuthTokenForRegistry,
  NpmrcParser,
  toSafeConfig,
  validateAuthToken,
} from '../npmrcParser.js'

describe('NpmrcParser', () => {
  let testDir: string

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `npmrc-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('parse', () => {
    it('should parse default registry', async () => {
      const npmrcContent = `
registry=https://custom.registry.com/
# This is a comment
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      expect(config.registry).toBe('https://custom.registry.com/')
    })

    it('should parse scoped registries', async () => {
      const npmrcContent = `
@mycompany:registry=https://npm.mycompany.com/
@bufteam:registry=https://clst.buf.team/gen/npm/v1/
registry=https://registry.npmjs.org/
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      expect(config.scopedRegistries.get('@mycompany')).toBe('https://npm.mycompany.com/')
      expect(config.scopedRegistries.get('@bufteam')).toBe('https://clst.buf.team/gen/npm/v1/')
      expect(config.registry).toBe('https://registry.npmjs.org/')
    })

    it('should parse auth tokens', async () => {
      const npmrcContent = `
//registry.npmjs.org/:_authToken=npm_token_123
//npm.mycompany.com/:_authToken=company_token_456
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      expect(config.authTokens.get('registry.npmjs.org')).toBe('npm_token_123')
      expect(config.authTokens.get('npm.mycompany.com')).toBe('company_token_456')
    })

    it('should skip comments and empty lines', async () => {
      const npmrcContent = `
# This is a comment
; This is also a comment

registry=https://registry.npmjs.org/

# Another comment
@mycompany:registry=https://npm.mycompany.com/
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      expect(config.registry).toBe('https://registry.npmjs.org/')
      expect(config.scopedRegistries.get('@mycompany')).toBe('https://npm.mycompany.com/')
    })

    it('should normalize registry URLs with trailing slash', async () => {
      const npmrcContent = `
registry=https://registry.npmjs.org
@mycompany:registry=https://npm.mycompany.com
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      expect(config.registry).toBe('https://registry.npmjs.org/')
      expect(config.scopedRegistries.get('@mycompany')).toBe('https://npm.mycompany.com/')
    })

    it('should handle quoted values', async () => {
      const npmrcContent = `
registry="https://registry.npmjs.org/"
@mycompany:registry='https://npm.mycompany.com/'
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      expect(config.registry).toBe('https://registry.npmjs.org/')
      expect(config.scopedRegistries.get('@mycompany')).toBe('https://npm.mycompany.com/')
    })

    it('should use default registry when no npmrc exists', async () => {
      const config = await NpmrcParser.parse(testDir, false)
      expect(config.registry).toBe('https://registry.npmjs.org/')
      expect(config.scopedRegistries.size).toBe(0)
    })
  })

  describe('getRegistryForPackage', () => {
    it('should return scoped registry for scoped packages', async () => {
      const npmrcContent = `
@mycompany:registry=https://npm.mycompany.com/
@bufteam:registry=https://clst.buf.team/gen/npm/v1/
registry=https://registry.npmjs.org/
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)

      expect(NpmrcParser.getRegistryForPackage('@mycompany/package', config)).toBe(
        'https://npm.mycompany.com/'
      )
      expect(NpmrcParser.getRegistryForPackage('@bufteam/fleet_acats.bufbuild_es', config)).toBe(
        'https://clst.buf.team/gen/npm/v1/'
      )
    })

    it('should return default registry for non-scoped packages', async () => {
      const npmrcContent = `
@mycompany:registry=https://npm.mycompany.com/
registry=https://registry.npmjs.org/
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)

      expect(NpmrcParser.getRegistryForPackage('express', config)).toBe(
        'https://registry.npmjs.org/'
      )
      expect(NpmrcParser.getRegistryForPackage('lodash', config)).toBe(
        'https://registry.npmjs.org/'
      )
    })

    it('should return default registry for unknown scoped packages', async () => {
      const npmrcContent = `
@mycompany:registry=https://npm.mycompany.com/
registry=https://custom.registry.com/
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)

      expect(NpmrcParser.getRegistryForPackage('@othercompany/package', config)).toBe(
        'https://custom.registry.com/'
      )
    })
  })

  describe('getAuthToken', () => {
    it('should return auth token for registry', async () => {
      const npmrcContent = `
//registry.npmjs.org/:_authToken=npm_token_123
//npm.mycompany.com/:_authToken=company_token_456
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)

      expect(NpmrcParser.getAuthToken('https://registry.npmjs.org/', config)).toBe('npm_token_123')
      expect(NpmrcParser.getAuthToken('https://npm.mycompany.com/', config)).toBe(
        'company_token_456'
      )
    })

    it('should return undefined for unknown registry', async () => {
      const npmrcContent = `
//registry.npmjs.org/:_authToken=npm_token_123
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)

      expect(NpmrcParser.getAuthToken('https://unknown.registry.com/', config)).toBeUndefined()
    })
  })

  describe('.pnpmrc support', () => {
    it('should parse .pnpmrc file', async () => {
      const pnpmrcContent = `
registry=https://pnpm.registry.com/
@mycompany:registry=https://pnpm.mycompany.com/
`
      writeFileSync(join(testDir, '.pnpmrc'), pnpmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      expect(config.registry).toBe('https://pnpm.registry.com/')
      expect(config.scopedRegistries.get('@mycompany')).toBe('https://pnpm.mycompany.com/')
    })

    it('should prioritize .pnpmrc over .npmrc', async () => {
      const npmrcContent = `
registry=https://npmrc.registry.com/
@mycompany:registry=https://npmrc.mycompany.com/
`
      const pnpmrcContent = `
registry=https://pnpmrc.registry.com/
@mycompany:registry=https://pnpmrc.mycompany.com/
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)
      writeFileSync(join(testDir, '.pnpmrc'), pnpmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      // .pnpmrc should override .npmrc
      expect(config.registry).toBe('https://pnpmrc.registry.com/')
      expect(config.scopedRegistries.get('@mycompany')).toBe('https://pnpmrc.mycompany.com/')
    })

    it('should handle partial .pnpmrc config', async () => {
      const npmrcContent = `
registry=https://npmrc.registry.com/
@company1:registry=https://npmrc.company1.com/
@company2:registry=https://npmrc.company2.com/
`
      const pnpmrcContent = `
@company1:registry=https://pnpmrc.company1.com/
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)
      writeFileSync(join(testDir, '.pnpmrc'), pnpmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      // .pnpmrc overrides @company1, but not @company2 or default registry
      expect(config.registry).toBe('https://npmrc.registry.com/')
      expect(config.scopedRegistries.get('@company1')).toBe('https://pnpmrc.company1.com/')
      expect(config.scopedRegistries.get('@company2')).toBe('https://npmrc.company2.com/')
    })
  })

  describe('environment variables', () => {
    it('should override with npm_config_registry environment variable', async () => {
      const npmrcContent = `
registry=https://registry.npmjs.org/
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      // Mock environment variable
      const originalEnv = process.env.npm_config_registry
      process.env.npm_config_registry = 'https://env.registry.com/'

      try {
        // Pass true to include environment variables
        const config = await NpmrcParser.parse(testDir, true)
        expect(config.registry).toBe('https://env.registry.com/')
      } finally {
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.npm_config_registry = originalEnv
        } else {
          delete process.env.npm_config_registry
        }
      }
    })
  })
})

describe('Safe config utilities', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `npmrc-sec-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('toSafeConfig', () => {
    it('should redact auth tokens from config', async () => {
      const npmrcContent = `
registry=https://registry.npmjs.org/
@mycompany:registry=https://npm.mycompany.com/
//registry.npmjs.org/:_authToken=secret_token_123
//npm.mycompany.com/:_authToken=another_secret_456
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      const safeConfig = toSafeConfig(config)

      // Safe config should NOT contain actual tokens
      expect(JSON.stringify(safeConfig)).not.toContain('secret_token_123')
      expect(JSON.stringify(safeConfig)).not.toContain('another_secret_456')

      // But should indicate tokens exist
      expect(safeConfig.hasAuthTokens).toBe(true)
      expect(safeConfig.authTokensCount).toBe(2)

      // Should preserve non-sensitive data
      expect(safeConfig.registry).toBe('https://registry.npmjs.org/')
      expect(safeConfig.scopedRegistries['@mycompany']).toBe('https://npm.mycompany.com/')
    })

    it('should handle config without auth tokens', async () => {
      const npmrcContent = `
registry=https://registry.npmjs.org/
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      const safeConfig = toSafeConfig(config)

      expect(safeConfig.hasAuthTokens).toBe(false)
      expect(safeConfig.authTokensCount).toBe(0)
    })

    it('should include config keys without values', async () => {
      const npmrcContent = `
registry=https://registry.npmjs.org/
strict-ssl=true
save-exact=true
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)
      const safeConfig = toSafeConfig(config)

      expect(safeConfig.configKeys).toContain('strict-ssl')
      expect(safeConfig.configKeys).toContain('save-exact')
    })
  })

  describe('hasAuthTokenForRegistry', () => {
    it('should return true when auth token exists', async () => {
      const npmrcContent = `
//registry.npmjs.org/:_authToken=secret_token_123
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)

      expect(hasAuthTokenForRegistry(config, 'registry.npmjs.org')).toBe(true)
    })

    it('should return false when auth token does not exist', async () => {
      const npmrcContent = `
//registry.npmjs.org/:_authToken=secret_token_123
`
      writeFileSync(join(testDir, '.npmrc'), npmrcContent)

      const config = await NpmrcParser.parse(testDir, false)

      expect(hasAuthTokenForRegistry(config, 'npm.mycompany.com')).toBe(false)
    })
  })

  describe('validateAuthToken (SEC-007)', () => {
    it('should validate new npm_ format tokens', () => {
      // Valid new format token (npm_ prefix + 36+ alphanumeric chars)
      const validToken = 'npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abc'
      const result = validateAuthToken(validToken)

      expect(result.isValid).toBe(true)
      expect(result.format).toBe('npm_token')
      expect(result.warnings).toHaveLength(0)
    })

    it('should validate legacy UUID format tokens', () => {
      const uuidToken = '12345678-1234-1234-1234-123456789abc'
      const result = validateAuthToken(uuidToken)

      expect(result.isValid).toBe(true)
      expect(result.format).toBe('legacy_uuid')
      expect(result.warnings).toHaveLength(0)
    })

    it('should reject empty tokens', () => {
      expect(validateAuthToken('').isValid).toBe(false)
      expect(validateAuthToken('   ').isValid).toBe(false)
      expect(validateAuthToken('').warnings).toContain('Token is empty or whitespace-only')
    })

    it('should reject placeholder tokens', () => {
      const placeholders = [
        'your-token-here',
        'YOUR_TOKEN',
        'todo',
        'TODO',
        'replace-me',
        'REPLACE_ME',
        'xxxxx',
        'XXXXXXXX',
        'placeholder',
        'insert-token',
      ]

      for (const placeholder of placeholders) {
        const result = validateAuthToken(placeholder)
        expect(result.isValid).toBe(false)
        expect(result.warnings).toContain('Token appears to be a placeholder value')
      }
    })

    it('should reject short tokens', () => {
      const shortToken = 'abc123'
      const result = validateAuthToken(shortToken)

      expect(result.isValid).toBe(false)
      expect(result.warnings).toContain('Token is suspiciously short (less than 20 characters)')
    })

    it('should reject invalid npm_ prefix tokens', () => {
      // Too short after prefix
      const invalidToken = 'npm_short'
      const result = validateAuthToken(invalidToken)

      expect(result.isValid).toBe(false)
      expect(result.format).toBe('npm_token')
      expect(result.warnings).toContain('Token has npm_ prefix but invalid format')
    })

    it('should accept unknown format for long enterprise tokens', () => {
      // Enterprise registries may use custom token formats
      const enterpriseToken = 'enterprise-custom-token-format-12345678901234567890'
      const result = validateAuthToken(enterpriseToken)

      expect(result.isValid).toBe(true)
      expect(result.format).toBe('unknown')
      expect(result.warnings).toHaveLength(0)
    })
  })
})
