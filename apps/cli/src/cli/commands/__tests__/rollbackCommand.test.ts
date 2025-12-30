/**
 * Rollback Command Tests
 */

import type { BackupInfo } from '@pcu/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock BackupService using vi.hoisted for proper class mocking
const backupServiceMocks = vi.hoisted(() => ({
  listBackups: vi.fn(),
  restoreFromBackup: vi.fn(),
  deleteAllBackups: vi.fn(),
  verifyRestoredFile: vi.fn(),
}))

vi.mock('@pcu/core', () => {
  return {
    BackupService: class MockBackupService {
      listBackups = backupServiceMocks.listBackups
      restoreFromBackup = backupServiceMocks.restoreFromBackup
      deleteAllBackups = backupServiceMocks.deleteAllBackups
      verifyRestoredFile = backupServiceMocks.verifyRestoredFile
    },
  }
})

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
      return `${key} ${JSON.stringify(params)}`
    }
    return key
  },
}))

// Mock inquirer
const inquirerMocks = vi.hoisted(() => ({
  prompt: vi.fn(),
}))

vi.mock('inquirer', () => ({
  default: {
    prompt: inquirerMocks.prompt,
  },
}))

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    blue: (text: string) => `[blue]${text}`,
    gray: (text: string) => `[gray]${text}`,
    cyan: (text: string) => `[cyan]${text}`,
    green: (text: string) => `[green]${text}`,
    yellow: (text: string) => `[yellow]${text}`,
  },
}))

// Mock StyledText
vi.mock('../../themes/colorTheme.js', () => ({
  StyledText: {
    iconWarning: (text: string) => `[warning]${text}`,
    iconSuccess: (text: string) => `[success]${text}`,
    iconError: (text: string) => `[error]${text}`,
    error: (text: string) => `[error]${text}`,
    muted: (text: string) => `[muted]${text}`,
  },
}))

// Mock commandHelpers
vi.mock('../../utils/commandHelpers.js', () => ({
  handleCommandError: vi.fn((error: unknown, _options?: unknown) => {
    console.error(`[error]error.unknown`)
    console.error(`[error]${String(error)}`)
    return false
  }),
}))

const { RollbackCommand } = await import('../rollbackCommand.js')

describe('RollbackCommand', () => {
  let command: InstanceType<typeof RollbackCommand>
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  const mockBackups: BackupInfo[] = [
    {
      path: '/workspace/pnpm-workspace.yaml.backup.2024-01-15T10-30-00-000Z',
      timestamp: new Date('2024-01-15T10:30:00.000Z'),
      size: 2048,
      formattedTime: '01/15/2024, 10:30:00',
    },
    {
      path: '/workspace/pnpm-workspace.yaml.backup.2024-01-14T09-00-00-000Z',
      timestamp: new Date('2024-01-14T09:00:00.000Z'),
      size: 1536,
      formattedTime: '01/14/2024, 09:00:00',
    },
    {
      path: '/workspace/pnpm-workspace.yaml.backup.2024-01-13T08-00-00-000Z',
      timestamp: new Date('2024-01-13T08:00:00.000Z'),
      size: 1024,
      formattedTime: '01/13/2024, 08:00:00',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    command = new RollbackCommand()
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Setup default mock for verifyRestoredFile
    backupServiceMocks.verifyRestoredFile.mockResolvedValue({
      success: true,
      isValidYaml: true,
      hasCatalogStructure: true,
      catalogs: ['default'],
      dependencyCount: 5,
    })
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('execute with --list option', () => {
    it('should list available backups', async () => {
      backupServiceMocks.listBackups.mockResolvedValue(mockBackups)

      await command.execute({ list: true })

      expect(backupServiceMocks.listBackups).toHaveBeenCalledWith(
        expect.stringContaining('pnpm-workspace.yaml')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('command.rollback.availableBackups')
      )
    })

    it('should show message when no backups exist', async () => {
      backupServiceMocks.listBackups.mockResolvedValue([])

      await command.execute({ list: true })

      expect(consoleSpy).toHaveBeenCalledWith('[warning]command.rollback.noBackups')
    })

    it('should show verbose information when verbose option is set', async () => {
      backupServiceMocks.listBackups.mockResolvedValue(mockBackups)

      await command.execute({ list: true, verbose: true })

      // Verbose mode shows path and size
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Path:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Size:'))
    })

    it('should use custom workspace path', async () => {
      backupServiceMocks.listBackups.mockResolvedValue([])

      await command.execute({ list: true, workspace: '/custom/path' })

      expect(backupServiceMocks.listBackups).toHaveBeenCalledWith(
        '/custom/path/pnpm-workspace.yaml'
      )
    })
  })

  describe('execute with --latest option', () => {
    it('should restore from latest backup when confirmed', async () => {
      backupServiceMocks.listBackups.mockResolvedValue(mockBackups)
      backupServiceMocks.restoreFromBackup.mockResolvedValue(
        '/workspace/pnpm-workspace.yaml.backup.pre-restore'
      )
      inquirerMocks.prompt.mockResolvedValue({ confirmed: true })

      await command.execute({ latest: true })

      expect(backupServiceMocks.restoreFromBackup).toHaveBeenCalledWith(
        expect.stringContaining('pnpm-workspace.yaml'),
        mockBackups[0]?.path
      )
      expect(consoleSpy).toHaveBeenCalledWith('[success]command.rollback.success')
    })

    it('should display auto-backup note and pre-restore backup path', async () => {
      const preRestoreBackupPath = '/workspace/pnpm-workspace.yaml.backup.2024-01-16T12-00-00-000Z'
      backupServiceMocks.listBackups.mockResolvedValue(mockBackups)
      backupServiceMocks.restoreFromBackup.mockResolvedValue(preRestoreBackupPath)
      inquirerMocks.prompt.mockResolvedValue({ confirmed: true })

      await command.execute({ latest: true })

      // Should show auto-backup note before confirmation
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('command.rollback.autoBackupNote')
      )
      // Should show pre-restore backup path after restore
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('command.rollback.preRestoreBackupCreated')
      )
      // Should show safety note
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('command.rollback.safetyNote')
      )
    })

    it('should not restore when user cancels', async () => {
      backupServiceMocks.listBackups.mockResolvedValue(mockBackups)
      inquirerMocks.prompt.mockResolvedValue({ confirmed: false })

      await command.execute({ latest: true })

      expect(backupServiceMocks.restoreFromBackup).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('[warning]command.rollback.cancelled')
    })

    it('should show message when no backups exist', async () => {
      backupServiceMocks.listBackups.mockResolvedValue([])

      await command.execute({ latest: true })

      expect(backupServiceMocks.restoreFromBackup).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('[warning]command.rollback.noBackups')
    })
  })

  describe('execute with --delete-all option', () => {
    it('should delete all backups when confirmed', async () => {
      backupServiceMocks.listBackups.mockResolvedValue(mockBackups)
      backupServiceMocks.deleteAllBackups.mockResolvedValue(3)
      inquirerMocks.prompt.mockResolvedValue({ confirmed: true })

      await command.execute({ deleteAll: true })

      expect(backupServiceMocks.deleteAllBackups).toHaveBeenCalledWith(
        expect.stringContaining('pnpm-workspace.yaml')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[success]command.rollback.deletedBackups')
      )
    })

    it('should not delete when user cancels', async () => {
      backupServiceMocks.listBackups.mockResolvedValue(mockBackups)
      inquirerMocks.prompt.mockResolvedValue({ confirmed: false })

      await command.execute({ deleteAll: true })

      expect(backupServiceMocks.deleteAllBackups).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('[warning]command.rollback.cancelled')
    })

    it('should show message when no backups exist', async () => {
      backupServiceMocks.listBackups.mockResolvedValue([])

      await command.execute({ deleteAll: true })

      expect(backupServiceMocks.deleteAllBackups).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('[warning]command.rollback.noBackups')
    })
  })

  describe('execute with interactive mode (default)', () => {
    it('should restore selected backup when confirmed', async () => {
      backupServiceMocks.listBackups.mockResolvedValue(mockBackups)
      backupServiceMocks.restoreFromBackup.mockResolvedValue(
        '/workspace/pnpm-workspace.yaml.backup.pre-restore'
      )
      inquirerMocks.prompt
        .mockResolvedValueOnce({ selectedBackup: mockBackups[1] })
        .mockResolvedValueOnce({ confirmed: true })

      await command.execute({})

      expect(backupServiceMocks.restoreFromBackup).toHaveBeenCalledWith(
        expect.stringContaining('pnpm-workspace.yaml'),
        mockBackups[1]?.path
      )
      expect(consoleSpy).toHaveBeenCalledWith('[success]command.rollback.success')
    })

    it('should display auto-backup note and pre-restore backup path in interactive mode', async () => {
      const preRestoreBackupPath = '/workspace/pnpm-workspace.yaml.backup.2024-01-16T12-00-00-000Z'
      backupServiceMocks.listBackups.mockResolvedValue(mockBackups)
      backupServiceMocks.restoreFromBackup.mockResolvedValue(preRestoreBackupPath)
      inquirerMocks.prompt
        .mockResolvedValueOnce({ selectedBackup: mockBackups[0] })
        .mockResolvedValueOnce({ confirmed: true })

      await command.execute({})

      // Should show auto-backup note before confirmation
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('command.rollback.autoBackupNote')
      )
      // Should show pre-restore backup path after restore
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('command.rollback.preRestoreBackupCreated')
      )
      // Should show safety note
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('command.rollback.safetyNote')
      )
    })

    it('should not restore when user cancels after selection', async () => {
      backupServiceMocks.listBackups.mockResolvedValue(mockBackups)
      inquirerMocks.prompt
        .mockResolvedValueOnce({ selectedBackup: mockBackups[0] })
        .mockResolvedValueOnce({ confirmed: false })

      await command.execute({})

      expect(backupServiceMocks.restoreFromBackup).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('[warning]command.rollback.cancelled')
    })

    it('should show message when no backups exist', async () => {
      backupServiceMocks.listBackups.mockResolvedValue([])

      await command.execute({})

      expect(inquirerMocks.prompt).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('[warning]command.rollback.noBackups')
    })
  })

  describe('error handling', () => {
    it('should handle and rethrow errors', async () => {
      const error = new Error('Backup service failed')
      backupServiceMocks.listBackups.mockRejectedValue(error)

      await expect(command.execute({ list: true })).rejects.toThrow('Backup service failed')
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[error]'))
    })

    it('should handle non-Error objects', async () => {
      backupServiceMocks.listBackups.mockRejectedValue('String error')

      await expect(command.execute({ list: true })).rejects.toBe('String error')
      expect(consoleErrorSpy).toHaveBeenCalledWith('[error]error.unknown')
    })
  })

  describe('getHelpText', () => {
    it('should return help text', () => {
      const helpText = RollbackCommand.getHelpText()

      expect(helpText).toContain('Rollback catalog updates')
      expect(helpText).toContain('--list')
      expect(helpText).toContain('--latest')
      expect(helpText).toContain('--delete-all')
      expect(helpText).toContain('Examples:')
    })
  })

  describe('workspace path handling', () => {
    it('should use process.cwd() when no workspace option provided', async () => {
      backupServiceMocks.listBackups.mockResolvedValue([])
      const originalCwd = process.cwd()

      await command.execute({ list: true })

      expect(backupServiceMocks.listBackups).toHaveBeenCalledWith(
        expect.stringContaining(originalCwd)
      )
    })

    it('should use provided workspace path', async () => {
      backupServiceMocks.listBackups.mockResolvedValue([])

      await command.execute({ list: true, workspace: '/my/project' })

      expect(backupServiceMocks.listBackups).toHaveBeenCalledWith('/my/project/pnpm-workspace.yaml')
    })
  })
})
