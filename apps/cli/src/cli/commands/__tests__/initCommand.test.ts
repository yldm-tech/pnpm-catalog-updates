/**
 * Init Command Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock node:fs
const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: fsMocks.existsSync,
  mkdirSync: fsMocks.mkdirSync,
  writeFileSync: fsMocks.writeFileSync,
}))

// Mock @pcu/utils
vi.mock('@pcu/utils', () => ({
  CommandExitError: class CommandExitError extends Error {
    code: number
    constructor(message: string, code = 1) {
      super(message)
      this.code = code
    }
    static success() {
      const err = new CommandExitError('Success', 0)
      return err
    }
    static failure(message: string) {
      return new CommandExitError(message, 1)
    }
  },
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  t: (key: string, params?: Record<string, unknown>) => {
    if (params) {
      let result = key
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{{${k}}}`, String(v))
      }
      return result
    }
    return key
  },
}))

// Mock theme module
vi.mock('../../themes/colorTheme.js', () => ({
  ThemeManager: {
    setTheme: vi.fn(),
  },
  StyledText: {
    iconInfo: (text: string) => `[info] ${text}`,
    iconSuccess: (text: string) => `[success] ${text}`,
    iconWarning: (text: string) => `[warning] ${text}`,
    iconError: (text: string) => `[error] ${text}`,
    muted: (text: string) => `[muted] ${text}`,
    warning: (text: string) => `[warning] ${text}`,
  },
}))

// Mock cliOutput
vi.mock('../../utils/cliOutput.js', () => ({
  cliOutput: {
    print: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock command helpers
vi.mock('../../utils/commandHelpers.js', () => ({
  handleCommandError: vi.fn(),
}))

// Mock validators
vi.mock('../../validators/index.js', () => ({
  errorsOnly: () => () => [],
  validateInitOptions: vi.fn(() => ({ valid: true, errors: [] })),
}))

// Import after mock setup
const { InitCommand } = await import('../initCommand.js')
const { CommandExitError } = await import('@pcu/utils')

describe('InitCommand', () => {
  let command: InstanceType<typeof InitCommand>

  beforeEach(() => {
    vi.clearAllMocks()
    command = new InitCommand()

    // Default: files don't exist
    fsMocks.existsSync.mockReturnValue(false)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('execute', () => {
    it('should create configuration file in current directory by default', async () => {
      // Mock workspace files exist
      fsMocks.existsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return true
        if (path.includes('pnpm-workspace.yaml')) return true
        if (path.includes('.pcurc.json')) return false
        return false
      })

      await expect(command.execute({})).rejects.toThrow()

      // Should write config file
      expect(fsMocks.writeFileSync).toHaveBeenCalled()
      const writeCall = fsMocks.writeFileSync.mock.calls.find((call) =>
        String(call[0]).includes('.pcurc.json')
      )
      expect(writeCall).toBeDefined()
    })

    it('should create workspace structure when missing', async () => {
      // No files exist
      fsMocks.existsSync.mockReturnValue(false)

      await expect(command.execute({ verbose: true })).rejects.toThrow()

      // Should create package.json
      const packageJsonCall = fsMocks.writeFileSync.mock.calls.find((call) =>
        String(call[0]).includes('package.json')
      )
      expect(packageJsonCall).toBeDefined()

      // Should create pnpm-workspace.yaml
      const workspaceYamlCall = fsMocks.writeFileSync.mock.calls.find((call) =>
        String(call[0]).includes('pnpm-workspace.yaml')
      )
      expect(workspaceYamlCall).toBeDefined()

      // Should create packages directory
      expect(fsMocks.mkdirSync).toHaveBeenCalled()
    })

    it('should skip workspace creation when createWorkspace is false', async () => {
      fsMocks.existsSync.mockImplementation((path: string) => {
        if (path.includes('.pcurc.json')) return false
        return false
      })

      await expect(command.execute({ createWorkspace: false })).rejects.toThrow()

      // Should not create package.json or workspace yaml
      const packageJsonCalls = fsMocks.writeFileSync.mock.calls.filter((call) =>
        String(call[0]).includes('package.json')
      )
      expect(packageJsonCalls.length).toBe(0)
    })

    it('should fail if config file exists without force flag', async () => {
      fsMocks.existsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return true
        if (path.includes('pnpm-workspace.yaml')) return true
        if (path.includes('.pcurc.json')) return true
        return false
      })

      await expect(command.execute({})).rejects.toThrow()

      // Should not overwrite existing config
      const configWriteCalls = fsMocks.writeFileSync.mock.calls.filter((call) =>
        String(call[0]).includes('.pcurc.json')
      )
      expect(configWriteCalls.length).toBe(0)
    })

    it('should overwrite config file when force flag is set', async () => {
      fsMocks.existsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return true
        if (path.includes('pnpm-workspace.yaml')) return true
        if (path.includes('.pcurc.json')) return true
        return false
      })

      await expect(command.execute({ force: true })).rejects.toThrow()

      // Should overwrite config
      const configWriteCall = fsMocks.writeFileSync.mock.calls.find((call) =>
        String(call[0]).includes('.pcurc.json')
      )
      expect(configWriteCall).toBeDefined()
    })

    it('should generate full configuration when full flag is set', async () => {
      fsMocks.existsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return true
        if (path.includes('pnpm-workspace.yaml')) return true
        if (path.includes('.pcurc.json')) return false
        return false
      })

      await expect(command.execute({ full: true })).rejects.toThrow()

      // Should write config with full options
      const configWriteCall = fsMocks.writeFileSync.mock.calls.find((call) =>
        String(call[0]).includes('.pcurc.json')
      )
      expect(configWriteCall).toBeDefined()

      const configContent = JSON.parse(configWriteCall![1] as string)
      // Full config should have packageRules, security, advanced, monorepo
      expect(configContent.packageRules).toBeDefined()
      expect(configContent.security).toBeDefined()
      expect(configContent.advanced).toBeDefined()
      expect(configContent.monorepo).toBeDefined()
    })

    it('should generate minimal configuration by default', async () => {
      fsMocks.existsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return true
        if (path.includes('pnpm-workspace.yaml')) return true
        if (path.includes('.pcurc.json')) return false
        return false
      })

      await expect(command.execute({})).rejects.toThrow()

      const configWriteCall = fsMocks.writeFileSync.mock.calls.find((call) =>
        String(call[0]).includes('.pcurc.json')
      )
      expect(configWriteCall).toBeDefined()

      const configContent = JSON.parse(configWriteCall![1] as string)
      // Minimal config should have defaults but no packageRules
      expect(configContent.defaults).toBeDefined()
      expect(configContent.defaults.target).toBe('latest')
      expect(configContent.defaults.createBackup).toBe(true)
      expect(configContent.packageRules).toBeUndefined()
    })

    it('should use custom workspace path when provided', async () => {
      const customPath = '/custom/workspace/path'
      fsMocks.existsSync.mockImplementation((path: string) => {
        if (path.includes(customPath)) {
          if (path.includes('package.json')) return true
          if (path.includes('pnpm-workspace.yaml')) return true
          if (path.includes('.pcurc.json')) return false
        }
        return false
      })

      await expect(command.execute({ workspace: customPath })).rejects.toThrow()

      // Config should be written to custom path
      const configWriteCall = fsMocks.writeFileSync.mock.calls.find((call) =>
        String(call[0]).includes(customPath)
      )
      expect(configWriteCall).toBeDefined()
    })

    it('should create config directory if it does not exist', async () => {
      fsMocks.existsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return true
        if (path.includes('pnpm-workspace.yaml')) return true
        // Config directory doesn't exist
        return false
      })

      await expect(command.execute({})).rejects.toThrow()

      // Should create directory
      expect(fsMocks.mkdirSync).toHaveBeenCalled()
    })
  })

  describe('validateOptions', () => {
    it('should return empty array for valid options', () => {
      const errors = InitCommand.validateOptions({})
      expect(errors).toEqual([])
    })
  })

  describe('getHelpText', () => {
    it('should return help text with all options', () => {
      const helpText = InitCommand.getHelpText()

      expect(helpText).toContain('Initialize PCU configuration')
      expect(helpText).toContain('--workspace')
      expect(helpText).toContain('--force')
      expect(helpText).toContain('--full')
      expect(helpText).toContain('--create-workspace')
      expect(helpText).toContain('--verbose')
      expect(helpText).toContain('--no-color')
    })

    it('should include usage examples', () => {
      const helpText = InitCommand.getHelpText()

      expect(helpText).toContain('pcu init')
      expect(helpText).toContain('pcu init --full')
      expect(helpText).toContain('pcu init --force')
    })

    it('should describe created files', () => {
      const helpText = InitCommand.getHelpText()

      expect(helpText).toContain('.pcurc.json')
      expect(helpText).toContain('package.json')
      expect(helpText).toContain('pnpm-workspace.yaml')
      expect(helpText).toContain('packages/')
    })
  })
})
