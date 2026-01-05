/**
 * Command Registrar Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted for mock values
const mocks = vi.hoisted(() => ({
  exitProcess: vi.fn(),
  isCommandExitError: vi.fn(),
  loggerError: vi.fn(),
}))

// Mock @inquirer/core
vi.mock('@inquirer/core', () => ({
  ExitPromptError: class ExitPromptError extends Error {
    constructor() {
      super('User cancelled')
      this.name = 'ExitPromptError'
    }
  },
}))

// Mock @pcu/utils
vi.mock('@pcu/utils', () => ({
  exitProcess: mocks.exitProcess,
  isCommandExitError: mocks.isCommandExitError,
  Logger: {
    setGlobalLevel: vi.fn(),
  },
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  parseBooleanFlag: (val: unknown) => Boolean(val),
  t: (key: string) => key,
  VersionChecker: {
    checkVersion: vi.fn().mockResolvedValue({ isLatest: true, currentVersion: '1.0.0' }),
    performUpdateAction: vi.fn().mockResolvedValue(true),
  },
  I18n: {
    getLocale: vi.fn().mockReturnValue('en'),
  },
}))

// Mock @pcu/core
vi.mock('@pcu/core', () => ({
  CatalogUpdateService: {
    createWithConfig: vi.fn().mockResolvedValue({}),
  },
  FileSystemService: class MockFileSystemService {},
  FileWorkspaceRepository: class MockFileWorkspaceRepository {},
  WorkspaceService: class MockWorkspaceService {},
  PnpmPackageManagerService: class MockPnpmPackageManagerService {},
}))

// Mock CLI output
vi.mock('../utils/cliOutput.js', () => ({
  cliOutput: {
    print: vi.fn(),
    error: vi.fn(),
  },
}))

// Import type for proper typing
import type { Services } from '../commandRegistrar.js'

// Import after mock setup
const { LazyServiceFactory, isExitPromptError, handleCommandError } = await import(
  '../commandRegistrar.js'
)

describe('commandRegistrar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('LazyServiceFactory', () => {
    it('should create services lazily on first get() call', async () => {
      const factory = new LazyServiceFactory('/test/path')

      expect(factory.isInitialized()).toBe(false)

      const services = await factory.get()

      expect(factory.isInitialized()).toBe(true)
      expect(services).toBeDefined()
      expect(services.fileSystemService).toBeDefined()
      expect(services.workspaceRepository).toBeDefined()
      expect(services.catalogUpdateService).toBeDefined()
      expect(services.workspaceService).toBeDefined()
      expect(services.packageManagerService).toBeDefined()
    })

    it('should return same services on subsequent get() calls', async () => {
      const factory = new LazyServiceFactory()

      const services1 = await factory.get()
      const services2 = await factory.get()

      expect(services1).toBe(services2)
    })

    it('should reset cached services', async () => {
      const factory = new LazyServiceFactory()

      await factory.get()
      expect(factory.isInitialized()).toBe(true)

      factory.reset()
      expect(factory.isInitialized()).toBe(false)
    })

    it('should allow injecting services via withServices', async () => {
      const mockServices = {
        fileSystemService: { mock: true },
        workspaceRepository: { mock: true },
        catalogUpdateService: { mock: true },
        workspaceService: { mock: true },
        packageManagerService: { mock: true },
      } as Services

      const factory = LazyServiceFactory.withServices(mockServices)

      const services = await factory.get()

      expect(services).toBe(mockServices)
      expect(factory.isInitialized()).toBe(true)
    })

    it('should work without workspace path', async () => {
      const factory = new LazyServiceFactory()

      const services = await factory.get()

      expect(services).toBeDefined()
    })
  })

  describe('isExitPromptError', () => {
    it('should return false for null/undefined', () => {
      expect(isExitPromptError(null)).toBe(false)
      expect(isExitPromptError(undefined)).toBe(false)
    })

    it('should return false for non-objects', () => {
      expect(isExitPromptError('error')).toBe(false)
      expect(isExitPromptError(123)).toBe(false)
      expect(isExitPromptError(true)).toBe(false)
    })

    it('should return true for ExitPromptError instance', async () => {
      const { ExitPromptError } = await import('@inquirer/core')
      const error = new ExitPromptError()

      expect(isExitPromptError(error)).toBe(true)
    })

    it('should return true for error with name ExitPromptError', () => {
      const error = { name: 'ExitPromptError', message: 'cancelled' }

      expect(isExitPromptError(error)).toBe(true)
    })

    it('should return true for error with constructor name ExitPromptError', () => {
      const error = {
        constructor: { name: 'ExitPromptError' },
        message: 'cancelled',
      }

      expect(isExitPromptError(error)).toBe(true)
    })

    it('should return false for regular errors', () => {
      const error = new Error('regular error')

      expect(isExitPromptError(error)).toBe(false)
    })
  })

  describe('handleCommandError', () => {
    it('should handle CommandExitError and exit with its code', () => {
      const error = { exitCode: 5 }
      mocks.isCommandExitError.mockReturnValue(true)

      handleCommandError(error, 'test')

      expect(mocks.exitProcess).toHaveBeenCalledWith(5)
    })

    it('should handle ExitPromptError and exit with 0', () => {
      const error = { name: 'ExitPromptError', message: 'cancelled' }
      mocks.isCommandExitError.mockReturnValue(false)

      handleCommandError(error, 'test')

      expect(mocks.exitProcess).toHaveBeenCalledWith(0)
    })

    it('should log and exit with 1 for general errors', () => {
      const error = new Error('general error')
      mocks.isCommandExitError.mockReturnValue(false)

      handleCommandError(error, 'test')

      expect(mocks.loggerError).toHaveBeenCalled()
      expect(mocks.exitProcess).toHaveBeenCalledWith(1)
    })

    it('should log command name in error', () => {
      const error = new Error('test error')
      mocks.isCommandExitError.mockReturnValue(false)

      handleCommandError(error, 'mycommand')

      expect(mocks.loggerError).toHaveBeenCalledWith(
        'mycommand command failed',
        expect.any(Error),
        expect.objectContaining({ command: 'mycommand' })
      )
    })
  })
})

describe('LazyServiceFactory isolation', () => {
  it('should provide isolated services for different instances', async () => {
    const factory1 = new LazyServiceFactory('/path1')
    const factory2 = new LazyServiceFactory('/path2')

    const services1 = await factory1.get()
    const services2 = await factory2.get()

    // Each factory creates its own services
    expect(services1).not.toBe(services2)
  })

  it('should allow multiple resets', () => {
    const factory = new LazyServiceFactory()

    factory.reset()
    factory.reset()
    factory.reset()

    expect(factory.isInitialized()).toBe(false)
  })
})
