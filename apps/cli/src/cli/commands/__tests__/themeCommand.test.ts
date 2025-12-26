/**
 * Theme Command Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @pcu/utils
vi.mock('@pcu/utils', () => ({
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

// Use vi.hoisted to ensure mocks are available during vi.mock hoisting
const mocks = vi.hoisted(() => ({
  listThemes: vi.fn(),
  setTheme: vi.fn(),
  getTheme: vi.fn(),
  configurationWizard: vi.fn(),
  selectTheme: vi.fn(),
}))

// Mock the theme module
vi.mock('../../themes/colorTheme.js', () => ({
  ThemeManager: {
    listThemes: mocks.listThemes,
    setTheme: mocks.setTheme,
    getTheme: mocks.getTheme,
    themes: {
      default: {},
      modern: {},
      minimal: {},
      neon: {},
    },
  },
  StyledText: {
    iconInfo: (text: string) => `[info]${text}`,
    iconSuccess: (text: string) => `[success]${text}`,
    iconError: (text: string) => `[error]${text}`,
    muted: (text: string) => `[muted]${text}`,
  },
}))

// Mock interactive prompts - use class syntax for proper constructor
vi.mock('../../interactive/interactivePrompts.js', () => {
  const InteractivePromptsMock = vi.fn(function (this: Record<string, unknown>) {
    this.configurationWizard = mocks.configurationWizard
    this.selectTheme = mocks.selectTheme
  })

  return {
    InteractivePrompts: InteractivePromptsMock,
  }
})

// Import after mock setup
const { ThemeCommand } = await import('../themeCommand.js')

describe('ThemeCommand', () => {
  let command: InstanceType<typeof ThemeCommand>
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up default mock return values
    mocks.listThemes.mockReturnValue(['default', 'modern', 'minimal', 'neon'])
    mocks.getTheme.mockReturnValue({
      success: (text: string) => `[success]${text}`,
      warning: (text: string) => `[warning]${text}`,
      error: (text: string) => `[error]${text}`,
      info: (text: string) => `[info]${text}`,
      major: (text: string) => `[major]${text}`,
      minor: (text: string) => `[minor]${text}`,
      patch: (text: string) => `[patch]${text}`,
      primary: (text: string) => `[primary]${text}`,
      text: (text: string) => `[text]${text}`,
      muted: (text: string) => `[muted]${text}`,
      prerelease: (text: string) => `[prerelease]${text}`,
    })
    mocks.configurationWizard.mockResolvedValue({ theme: 'modern' })
    mocks.selectTheme.mockResolvedValue('modern')

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    command = new ThemeCommand()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.resetAllMocks()
  })

  describe('execute', () => {
    it('should list themes when --list flag is set', async () => {
      await command.execute({ list: true })

      expect(consoleSpy).toHaveBeenCalled()
      const calls = consoleSpy.mock.calls.flat().join(' ')
      expect(calls).toContain('default')
      expect(calls).toContain('modern')
      expect(calls).toContain('minimal')
      expect(calls).toContain('neon')
    })

    it('should set theme when --set flag is used with valid theme', async () => {
      await command.execute({ set: 'modern' })

      expect(mocks.setTheme).toHaveBeenCalledWith('modern')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should throw error when --set flag is used with invalid theme', async () => {
      await expect(command.execute({ set: 'invalid-theme' })).rejects.toThrow(
        'command.theme.invalidTheme'
      )

      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should run interactive mode when --interactive flag is set', async () => {
      await command.execute({ interactive: true })

      expect(mocks.selectTheme).toHaveBeenCalled()
      expect(mocks.setTheme).toHaveBeenCalledWith('modern')
    })

    it('should show current theme and list by default', async () => {
      await command.execute({})

      expect(consoleSpy).toHaveBeenCalled()
      expect(mocks.listThemes).toHaveBeenCalled()
    })
  })

  describe('getHelpText', () => {
    it('should return help text with all options', () => {
      const helpText = ThemeCommand.getHelpText()

      expect(helpText).toContain('Configure color theme')
      expect(helpText).toContain('--set')
      expect(helpText).toContain('--list')
      expect(helpText).toContain('--interactive')
      expect(helpText).toContain('default')
      expect(helpText).toContain('modern')
      expect(helpText).toContain('minimal')
      expect(helpText).toContain('neon')
    })
  })
})
