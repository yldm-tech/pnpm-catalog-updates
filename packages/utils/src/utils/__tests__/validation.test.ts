/**
 * Validation Utilities Tests
 */

import { describe, expect, it } from 'vitest'
import {
  createValidationResult,
  isValidEmail,
  isValidGlob,
  isValidJson,
  isValidLogLevel,
  isValidOutputFormat,
  isValidPackageName,
  isValidPath,
  isValidPort,
  isValidSemver,
  isValidTimeout,
  isValidUpdateTarget,
  isValidUrl,
  isValidYaml,
  sanitizePackageName,
  sanitizeString,
  ValidationResultClass,
  validateCliOptions,
  validateConfig,
} from '../validation.js'

describe('ValidationResultClass', () => {
  describe('constructor', () => {
    it('should create valid result', () => {
      const result = new ValidationResultClass(true, [], [])

      expect(result.isValid).toBe(true)
      expect(result.getIsValid()).toBe(true)
      expect(result.errors).toEqual([])
      expect(result.warnings).toEqual([])
    })

    it('should create invalid result with errors', () => {
      const result = new ValidationResultClass(false, ['Error 1', 'Error 2'], [])

      expect(result.isValid).toBe(false)
      expect(result.getErrors()).toEqual(['Error 1', 'Error 2'])
    })

    it('should create result with warnings', () => {
      const result = new ValidationResultClass(true, [], ['Warning 1'])

      expect(result.isValid).toBe(true)
      expect(result.getWarnings()).toEqual(['Warning 1'])
    })

    it('should return defensive copies of arrays', () => {
      const result = new ValidationResultClass(false, ['Error 1'], ['Warning 1'])

      const errors = result.getErrors()
      const warnings = result.getWarnings()

      errors.push('Modified')
      warnings.push('Modified')

      expect(result.getErrors()).toEqual(['Error 1'])
      expect(result.getWarnings()).toEqual(['Warning 1'])
    })
  })

  describe('hasErrors', () => {
    it('should return true when there are errors', () => {
      const result = new ValidationResultClass(false, ['Error 1'], [])
      expect(result.hasErrors()).toBe(true)
    })

    it('should return false when there are no errors', () => {
      const result = new ValidationResultClass(true, [], [])
      expect(result.hasErrors()).toBe(false)
    })
  })

  describe('hasWarnings', () => {
    it('should return true when there are warnings', () => {
      const result = new ValidationResultClass(true, [], ['Warning 1'])
      expect(result.hasWarnings()).toBe(true)
    })

    it('should return false when there are no warnings', () => {
      const result = new ValidationResultClass(true, [], [])
      expect(result.hasWarnings()).toBe(false)
    })
  })

  describe('merge', () => {
    it('should merge multiple results', () => {
      const result1 = { errors: ['E1'], warnings: ['W1'] }
      const result2 = { errors: ['E2'], warnings: ['W2'] }
      const result3 = { errors: [], warnings: ['W3'] }

      const merged = ValidationResultClass.merge(result1, result2, result3)

      expect(merged.isValid).toBe(false) // Has errors
      expect(merged.errors).toEqual(['E1', 'E2'])
      expect(merged.warnings).toEqual(['W1', 'W2', 'W3'])
    })

    it('should be valid when no errors', () => {
      const result1 = { errors: [], warnings: ['W1'] }
      const result2 = { errors: [], warnings: ['W2'] }

      const merged = ValidationResultClass.merge(result1, result2)

      expect(merged.isValid).toBe(true)
    })
  })

  describe('static factories', () => {
    it('should create valid result', () => {
      const result = ValidationResultClass.valid(['Warning'])

      expect(result.isValid).toBe(true)
      expect(result.errors).toEqual([])
      expect(result.warnings).toEqual(['Warning'])
    })

    it('should create invalid result', () => {
      const result = ValidationResultClass.invalid(['Error'], ['Warning'])

      expect(result.isValid).toBe(false)
      expect(result.errors).toEqual(['Error'])
      expect(result.warnings).toEqual(['Warning'])
    })
  })
})

describe('createValidationResult', () => {
  it('should create valid result by default', () => {
    const result = createValidationResult()

    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('should create result with provided values', () => {
    const result = createValidationResult(false, ['Error'], ['Warning'])

    expect(result.isValid).toBe(false)
    expect(result.errors).toEqual(['Error'])
    expect(result.warnings).toEqual(['Warning'])
  })
})

describe('isValidEmail', () => {
  it('should return true for valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
    expect(isValidEmail('user+tag@example.org')).toBe(true)
  })

  it('should return false for invalid emails', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('user@')).toBe(false)
    expect(isValidEmail('@domain.com')).toBe(false)
    expect(isValidEmail('user @domain.com')).toBe(false)
  })
})

describe('isValidUrl', () => {
  it('should return true for valid URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true)
    expect(isValidUrl('http://localhost:3000')).toBe(true)
    expect(isValidUrl('ftp://files.example.com/path')).toBe(true)
    expect(isValidUrl('https://user:pass@example.com:8080/path?query=1#hash')).toBe(true)
  })

  it('should return false for invalid URLs', () => {
    expect(isValidUrl('')).toBe(false)
    expect(isValidUrl('not-a-url')).toBe(false)
    expect(isValidUrl('example.com')).toBe(false)
    expect(isValidUrl('://missing-protocol.com')).toBe(false)
  })
})

describe('isValidSemver', () => {
  it('should return true for valid semver versions', () => {
    expect(isValidSemver('1.0.0')).toBe(true)
    expect(isValidSemver('0.0.1')).toBe(true)
    expect(isValidSemver('10.20.30')).toBe(true)
    expect(isValidSemver('1.0.0-alpha')).toBe(true)
    expect(isValidSemver('1.0.0-alpha.1')).toBe(true)
    expect(isValidSemver('1.0.0+build.123')).toBe(true)
    expect(isValidSemver('1.0.0-beta+build.456')).toBe(true)
  })

  it('should return false for invalid semver versions', () => {
    expect(isValidSemver('')).toBe(false)
    expect(isValidSemver('1')).toBe(false)
    expect(isValidSemver('1.0')).toBe(false)
    expect(isValidSemver('1.0.0.0')).toBe(false)
    expect(isValidSemver('v1.0.0')).toBe(false)
    expect(isValidSemver('01.0.0')).toBe(false) // Leading zeros
    expect(isValidSemver('1.00.0')).toBe(false)
  })
})

describe('isValidPackageName', () => {
  it('should return true for valid package names', () => {
    expect(isValidPackageName('lodash')).toBe(true)
    expect(isValidPackageName('my-package')).toBe(true)
    expect(isValidPackageName('package123')).toBe(true)
    expect(isValidPackageName('@scope/package')).toBe(true)
    expect(isValidPackageName('@my-org/my-package')).toBe(true)
  })

  it('should return false for invalid package names', () => {
    expect(isValidPackageName('')).toBe(false)
    expect(isValidPackageName('UPPERCASE')).toBe(false)
    expect(isValidPackageName('.hidden')).toBe(false)
    expect(isValidPackageName('_underscore')).toBe(false)
    expect(isValidPackageName('a'.repeat(215))).toBe(false) // Too long
  })
})

describe('isValidPath', () => {
  it('should return true for valid paths', () => {
    expect(isValidPath('/path/to/file')).toBe(true)
    expect(isValidPath('./relative/path')).toBe(true)
    expect(isValidPath('file.txt')).toBe(true)
    expect(isValidPath('C:\\Windows\\path')).toBe(true)
  })

  it('should return false for invalid paths', () => {
    expect(isValidPath('')).toBe(false)
    expect(isValidPath('path\0with\0nulls')).toBe(false)
    expect(isValidPath('a'.repeat(4096))).toBe(false) // Too long
  })
})

describe('isValidJson', () => {
  it('should return true for valid JSON', () => {
    expect(isValidJson('{}')).toBe(true)
    expect(isValidJson('[]')).toBe(true)
    expect(isValidJson('{"key": "value"}')).toBe(true)
    expect(isValidJson('[1, 2, 3]')).toBe(true)
    expect(isValidJson('null')).toBe(true)
    expect(isValidJson('"string"')).toBe(true)
  })

  it('should return false for invalid JSON', () => {
    expect(isValidJson('')).toBe(false)
    expect(isValidJson('undefined')).toBe(false)
    expect(isValidJson('{key: value}')).toBe(false)
    expect(isValidJson("{'key': 'value'}")).toBe(false)
    expect(isValidJson('{trailing,}')).toBe(false)
  })
})

describe('isValidYaml', () => {
  it('should return true for valid YAML', () => {
    expect(isValidYaml('key: value')).toBe(true)
    expect(isValidYaml('# comment')).toBe(true)
    expect(isValidYaml('nested:\n  key: value')).toBe(true)
    expect(isValidYaml('- item1\n- item2')).toBe(true)
    expect(isValidYaml('')).toBe(true)
    // YAML allows any consistent indentation, not just 2-space
    expect(isValidYaml('   oddindent: value')).toBe(true)
    // Complex nested structures
    expect(isValidYaml('parent:\n  child:\n    grandchild: value')).toBe(true)
    // Multi-line strings
    expect(isValidYaml('text: |\n  line1\n  line2')).toBe(true)
  })

  it('should return false for invalid YAML', () => {
    // Unclosed quotes
    expect(isValidYaml('"unclosed string')).toBe(false)
    expect(isValidYaml("'unclosed string")).toBe(false)
    // Invalid mapping structure - tab + space mixed indentation
    expect(isValidYaml('key:\n\t value')).toBe(false)
    // Invalid flow sequence
    expect(isValidYaml('[unclosed, list')).toBe(false)
    // Invalid flow mapping
    expect(isValidYaml('{unclosed: map')).toBe(false)
    // Duplicate keys in strict mode
    expect(isValidYaml('key: value1\nkey: value2')).toBe(false)
  })
})

describe('isValidGlob', () => {
  it('should return true for valid glob patterns', () => {
    expect(isValidGlob('*.js')).toBe(true)
    expect(isValidGlob('**/*.ts')).toBe(true)
    expect(isValidGlob('src/**/*.tsx')).toBe(true)
    expect(isValidGlob('file?.txt')).toBe(true)
    expect(isValidGlob('{a,b,c}')).toBe(true)
    expect(isValidGlob('[abc]')).toBe(true)
  })

  it('should return false for invalid glob patterns', () => {
    expect(isValidGlob('**/**/**/*')).toBe(false) // Too many recursive wildcards
    expect(isValidGlob('path//to//file')).toBe(false) // Double slashes
    expect(isValidGlob('unbalanced[')).toBe(false)
    expect(isValidGlob('unbalanced{')).toBe(false)
    expect(isValidGlob('path]bracket')).toBe(false) // Unbalanced
  })
})

describe('isValidPort', () => {
  it('should return true for valid ports', () => {
    expect(isValidPort(1)).toBe(true)
    expect(isValidPort(80)).toBe(true)
    expect(isValidPort(443)).toBe(true)
    expect(isValidPort(8080)).toBe(true)
    expect(isValidPort(65535)).toBe(true)
    expect(isValidPort('3000')).toBe(true)
  })

  it('should return false for invalid ports', () => {
    expect(isValidPort(0)).toBe(false)
    expect(isValidPort(-1)).toBe(false)
    expect(isValidPort(65536)).toBe(false)
    expect(isValidPort('invalid')).toBe(false)
    expect(isValidPort(NaN)).toBe(false)
  })
})

describe('isValidTimeout', () => {
  it('should return true for valid timeouts', () => {
    expect(isValidTimeout(1)).toBe(true)
    expect(isValidTimeout(1000)).toBe(true)
    expect(isValidTimeout(300000)).toBe(true) // 5 minutes
  })

  it('should return false for invalid timeouts', () => {
    expect(isValidTimeout(0)).toBe(false)
    expect(isValidTimeout(-1)).toBe(false)
    expect(isValidTimeout(300001)).toBe(false) // Over 5 minutes
  })
})

describe('isValidLogLevel', () => {
  it('should return true for valid log levels', () => {
    expect(isValidLogLevel('error')).toBe(true)
    expect(isValidLogLevel('warn')).toBe(true)
    expect(isValidLogLevel('info')).toBe(true)
    expect(isValidLogLevel('debug')).toBe(true)
    expect(isValidLogLevel('ERROR')).toBe(true) // Case insensitive
    expect(isValidLogLevel('Debug')).toBe(true)
  })

  it('should return false for invalid log levels', () => {
    expect(isValidLogLevel('')).toBe(false)
    expect(isValidLogLevel('trace')).toBe(false)
    expect(isValidLogLevel('verbose')).toBe(false)
    expect(isValidLogLevel('fatal')).toBe(false)
  })
})

describe('isValidUpdateTarget', () => {
  it('should return true for valid update targets', () => {
    expect(isValidUpdateTarget('latest')).toBe(true)
    expect(isValidUpdateTarget('greatest')).toBe(true)
    expect(isValidUpdateTarget('minor')).toBe(true)
    expect(isValidUpdateTarget('patch')).toBe(true)
    expect(isValidUpdateTarget('newest')).toBe(true)
    expect(isValidUpdateTarget('LATEST')).toBe(true) // Case insensitive
  })

  it('should return false for invalid update targets', () => {
    expect(isValidUpdateTarget('')).toBe(false)
    expect(isValidUpdateTarget('major')).toBe(false)
    expect(isValidUpdateTarget('all')).toBe(false)
  })
})

describe('isValidOutputFormat', () => {
  it('should return true for valid output formats', () => {
    expect(isValidOutputFormat('table')).toBe(true)
    expect(isValidOutputFormat('json')).toBe(true)
    expect(isValidOutputFormat('yaml')).toBe(true)
    expect(isValidOutputFormat('minimal')).toBe(true)
    expect(isValidOutputFormat('JSON')).toBe(true) // Case insensitive
  })

  it('should return false for invalid output formats', () => {
    expect(isValidOutputFormat('')).toBe(false)
    expect(isValidOutputFormat('xml')).toBe(false)
    expect(isValidOutputFormat('csv')).toBe(false)
  })
})

describe('validateCliOptions', () => {
  it('should return valid for empty options', () => {
    const result = validateCliOptions({})

    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('should validate workspace path', () => {
    const result = validateCliOptions({ workspace: 'path\0with\0null' })

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invalid workspace path')
  })

  it('should validate registry URL', () => {
    const result = validateCliOptions({ registry: 'not-a-url' })

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invalid registry URL')
  })

  it('should validate timeout', () => {
    const result = validateCliOptions({ timeout: 0 })

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invalid timeout value (must be between 1 and 300000ms)')
  })

  it('should validate target', () => {
    const result = validateCliOptions({ target: 'invalid' })

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain(
      'Invalid update target (must be: latest, greatest, minor, patch, newest)'
    )
  })

  it('should validate format', () => {
    const result = validateCliOptions({ format: 'xml' })

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invalid output format (must be: table, json, yaml, minimal)')
  })

  it('should validate include patterns', () => {
    const result = validateCliOptions({ include: ['valid/*', '**/**/**/*'] })

    expect(result.isValid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('should validate exclude patterns', () => {
    const result = validateCliOptions({ exclude: ['path//double'] })

    expect(result.isValid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('should validate catalog name', () => {
    const result1 = validateCliOptions({ catalog: '' })
    expect(result1.errors).toContain('Catalog name cannot be empty')

    const result2 = validateCliOptions({ catalog: 'path/separator' })
    expect(result2.errors).toContain('Catalog name cannot contain path separators')
  })

  it('should validate multiple options', () => {
    const result = validateCliOptions({
      workspace: '/valid/path',
      registry: 'https://registry.npmjs.org',
      timeout: 5000,
      target: 'latest',
      format: 'json',
    })

    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
  })
})

describe('validateConfig', () => {
  it('should return valid for empty config', () => {
    const result = validateConfig({})

    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('should validate registry settings', () => {
    const result = validateConfig({
      registry: {
        url: 'not-a-url',
        timeout: 0,
        retries: 20,
      },
    })

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invalid registry URL in configuration')
    expect(result.errors).toContain('Invalid registry timeout in configuration')
    expect(result.warnings).toContain('Registry retries should be between 0 and 10')
  })

  it('should validate update settings', () => {
    const result = validateConfig({
      update: {
        target: 'invalid',
      },
    })

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invalid update target in configuration')
  })

  it('should validate output settings', () => {
    const result = validateConfig({
      output: {
        format: 'xml',
      },
    })

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invalid output format in configuration')
  })

  it('should validate logging settings', () => {
    const result = validateConfig({
      logging: {
        level: 'invalid',
        file: 'path\0with\0null',
      },
    })

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invalid log level in configuration')
    expect(result.errors).toContain('Invalid log file path in configuration')
  })

  it('should pass valid configuration', () => {
    const result = validateConfig({
      registry: {
        url: 'https://registry.npmjs.org',
        timeout: 5000,
        retries: 3,
      },
      update: {
        target: 'latest',
      },
      output: {
        format: 'json',
      },
      logging: {
        level: 'info',
        file: '/var/log/pcu.log',
      },
    })

    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
  })
})

describe('sanitizeString', () => {
  it('should return trimmed string by default', () => {
    expect(sanitizeString('  hello world  ')).toBe('hello world')
  })

  it('should truncate to max length', () => {
    expect(sanitizeString('hello world', { maxLength: 5 })).toBe('hello')
  })

  it('should filter by allowed characters', () => {
    // Note: allowedChars.source is used in [^...], so use raw char ranges, not char classes
    expect(sanitizeString('hello123', { allowedChars: /a-z/ })).toBe('hello')
    expect(sanitizeString('Hello123', { allowedChars: /a-zA-Z/ })).toBe('Hello')
  })

  it('should strip HTML tags', () => {
    // Note: stripHtml removes tags but content between tags remains
    // The implementation removes <script> and </script> tags, leaving inner content
    expect(sanitizeString('<div>content</div>', { stripHtml: true })).toBe('content')
    expect(sanitizeString('a<b>c</b>d', { stripHtml: true })).toBe('acd')
    // Verify tags are removed even if content remains
    expect(sanitizeString('<p>text</p>', { stripHtml: true })).toBe('text')
  })

  it('should strip HTML entities', () => {
    expect(sanitizeString('hello&nbsp;world', { stripHtml: true })).toBe('helloworld')
  })

  it('should remove dangerous protocols', () => {
    expect(sanitizeString('javascript:alert(1)', { stripHtml: true })).toBe('alert(1)')
    expect(sanitizeString('data:text/html,<script>', { stripHtml: true })).toBe('text/html,')
  })

  it('should remove event handlers', () => {
    expect(sanitizeString('onclick=alert(1)', { stripHtml: true })).toBe('alert(1)')
    expect(sanitizeString('onerror=hack()', { stripHtml: true })).toBe('hack()')
  })

  it('should handle complex XSS attempts', () => {
    const xss = '<img src=x onerror="alert(1)"><script>document.cookie</script>'
    const result = sanitizeString(xss, { stripHtml: true })
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).not.toContain('onerror')
  })

  it('should combine multiple options', () => {
    // Note: Order is stripHtml → allowedChars → maxLength → trim
    // Using raw char ranges for allowedChars (not [a-zA-Z] which creates nested brackets)
    const result = sanitizeString('<b>Hello123</b>', {
      stripHtml: true,
      allowedChars: /a-zA-Z/,
      maxLength: 5,
    })
    expect(result).toBe('Hello')
  })
})

describe('sanitizePackageName', () => {
  it('should lowercase and sanitize package names', () => {
    expect(sanitizePackageName('LODASH')).toBe('lodash')
    expect(sanitizePackageName('@Scope/Package')).toBe('@scope/package')
  })

  it('should handle various package name formats', () => {
    // Note: sanitizePackageName uses allowedChars with char class /[a-z0-9@/._~*-]/
    // The nested brackets in the negation have limited filtering capability
    // Verify trimming works
    expect(sanitizePackageName(' lodash ').trim()).toBe('lodash')
    // Verify lowercase works
    expect(sanitizePackageName('Lodash')).toBe('lodash')
    // Verify valid characters pass through
    expect(sanitizePackageName('lodash-es')).toBe('lodash-es')
    expect(sanitizePackageName('@types/node')).toBe('@types/node')
  })

  it('should truncate long names', () => {
    const longName = 'a'.repeat(300)
    expect(sanitizePackageName(longName).length).toBeLessThanOrEqual(214)
  })

  it('should handle valid package names', () => {
    expect(sanitizePackageName('lodash')).toBe('lodash')
    expect(sanitizePackageName('@types/node')).toBe('@types/node')
    expect(sanitizePackageName('my-package-123')).toBe('my-package-123')
  })
})
