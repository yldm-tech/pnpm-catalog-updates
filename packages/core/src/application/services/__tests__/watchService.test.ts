/**
 * Watch Service Tests
 */

import type { FSWatcher } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock fs
const mockWatcher = {
  on: vi.fn(),
  close: vi.fn(),
}

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  watch: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: fsMocks,
  existsSync: fsMocks.existsSync,
  watch: fsMocks.watch,
}))

const { WatchService } = await import('../watchService.js')

describe('WatchService', () => {
  let service: InstanceType<typeof WatchService>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    service = new WatchService()

    // Default mock implementations
    fsMocks.existsSync.mockReturnValue(true)
    fsMocks.watch.mockReturnValue(mockWatcher as unknown as FSWatcher)
  })

  afterEach(() => {
    service.stop()
    vi.useRealTimers()
  })

  describe('watch', () => {
    it('should throw error when file does not exist', async () => {
      fsMocks.existsSync.mockReturnValue(false)

      const callbacks = {
        onChange: vi.fn(),
      }

      await expect(service.watch('/path/to/file.yaml', callbacks)).rejects.toThrow(
        'File not found: /path/to/file.yaml'
      )
    })

    it('should call onStart callback when watch starts', async () => {
      const callbacks = {
        onChange: vi.fn(),
        onStart: vi.fn(),
      }

      await service.watch('/path/to/file.yaml', callbacks)

      expect(callbacks.onStart).toHaveBeenCalledTimes(1)
    })

    it('should call onChange on start when runOnStart is true', async () => {
      const callbacks = {
        onChange: vi.fn(),
      }

      await service.watch('/path/to/file.yaml', callbacks, { runOnStart: true })

      expect(callbacks.onChange).toHaveBeenCalledWith('/path/to/file.yaml')
    })

    it('should not call onChange on start when runOnStart is false', async () => {
      const callbacks = {
        onChange: vi.fn(),
      }

      await service.watch('/path/to/file.yaml', callbacks, { runOnStart: false })

      expect(callbacks.onChange).not.toHaveBeenCalled()
    })

    it('should call onError when initial onChange throws', async () => {
      const error = new Error('Initial check failed')
      const callbacks = {
        onChange: vi.fn().mockRejectedValue(error),
        onError: vi.fn(),
      }

      await service.watch('/path/to/file.yaml', callbacks, { runOnStart: true })

      expect(callbacks.onError).toHaveBeenCalledWith(error)
    })

    it('should set up fs.watch on the directory', async () => {
      const callbacks = {
        onChange: vi.fn(),
      }

      await service.watch('/workspace/pnpm-workspace.yaml', callbacks, { runOnStart: false })

      expect(fsMocks.watch).toHaveBeenCalledWith('/workspace', expect.any(Function))
    })

    it('should register error handler on watcher', async () => {
      const callbacks = {
        onChange: vi.fn(),
      }

      await service.watch('/path/to/file.yaml', callbacks, { runOnStart: false })

      expect(mockWatcher.on).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('should set watching to true after starting', async () => {
      const callbacks = {
        onChange: vi.fn(),
      }

      expect(service.watching).toBe(false)
      await service.watch('/path/to/file.yaml', callbacks, { runOnStart: false })
      expect(service.watching).toBe(true)
    })
  })

  describe('file change handling', () => {
    it('should call onChange when target file changes', async () => {
      let watchCallback: (eventType: string, filename: string) => void = () => {}
      fsMocks.watch.mockImplementation((_dir: string, cb: typeof watchCallback) => {
        watchCallback = cb
        return mockWatcher as unknown as FSWatcher
      })

      const callbacks = {
        onChange: vi.fn().mockResolvedValue(undefined),
      }

      await service.watch('/workspace/pnpm-workspace.yaml', callbacks, { runOnStart: false })

      // Simulate file change
      watchCallback('change', 'pnpm-workspace.yaml')

      // Fast forward past debounce
      await vi.advanceTimersByTimeAsync(400)

      expect(callbacks.onChange).toHaveBeenCalledWith('/workspace/pnpm-workspace.yaml')
    })

    it('should ignore changes to other files', async () => {
      let watchCallback: (eventType: string, filename: string) => void = () => {}
      fsMocks.watch.mockImplementation((_dir: string, cb: typeof watchCallback) => {
        watchCallback = cb
        return mockWatcher as unknown as FSWatcher
      })

      const callbacks = {
        onChange: vi.fn(),
      }

      await service.watch('/workspace/pnpm-workspace.yaml', callbacks, { runOnStart: false })

      // Simulate change to different file
      watchCallback('change', 'other-file.yaml')

      await vi.advanceTimersByTimeAsync(400)

      expect(callbacks.onChange).not.toHaveBeenCalled()
    })

    it('should debounce rapid changes', async () => {
      let watchCallback: (eventType: string, filename: string) => void = () => {}
      fsMocks.watch.mockImplementation((_dir: string, cb: typeof watchCallback) => {
        watchCallback = cb
        return mockWatcher as unknown as FSWatcher
      })

      const callbacks = {
        onChange: vi.fn().mockResolvedValue(undefined),
      }

      await service.watch('/workspace/pnpm-workspace.yaml', callbacks, {
        runOnStart: false,
        debounceMs: 300,
      })

      // Simulate rapid file changes
      watchCallback('change', 'pnpm-workspace.yaml')
      await vi.advanceTimersByTimeAsync(100)
      watchCallback('change', 'pnpm-workspace.yaml')
      await vi.advanceTimersByTimeAsync(100)
      watchCallback('change', 'pnpm-workspace.yaml')
      await vi.advanceTimersByTimeAsync(400)

      // Should only call onChange once due to debouncing
      expect(callbacks.onChange).toHaveBeenCalledTimes(1)
    })

    it('should use custom debounce time', async () => {
      let watchCallback: (eventType: string, filename: string) => void = () => {}
      fsMocks.watch.mockImplementation((_dir: string, cb: typeof watchCallback) => {
        watchCallback = cb
        return mockWatcher as unknown as FSWatcher
      })

      const callbacks = {
        onChange: vi.fn().mockResolvedValue(undefined),
      }

      await service.watch('/workspace/pnpm-workspace.yaml', callbacks, {
        runOnStart: false,
        debounceMs: 500,
      })

      watchCallback('change', 'pnpm-workspace.yaml')
      await vi.advanceTimersByTimeAsync(400)

      // Should not have called yet (500ms debounce)
      expect(callbacks.onChange).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(200)

      // Now it should have been called
      expect(callbacks.onChange).toHaveBeenCalledTimes(1)
    })

    it('should call onError when onChange throws during file change', async () => {
      let watchCallback: (eventType: string, filename: string) => void = () => {}
      fsMocks.watch.mockImplementation((_dir: string, cb: typeof watchCallback) => {
        watchCallback = cb
        return mockWatcher as unknown as FSWatcher
      })

      const error = new Error('Check failed')
      const callbacks = {
        onChange: vi.fn().mockRejectedValue(error),
        onError: vi.fn(),
      }

      await service.watch('/workspace/pnpm-workspace.yaml', callbacks, { runOnStart: false })

      watchCallback('change', 'pnpm-workspace.yaml')
      await vi.advanceTimersByTimeAsync(400)

      expect(callbacks.onError).toHaveBeenCalledWith(error)
    })
  })

  describe('stop', () => {
    it('should close the watcher', async () => {
      const callbacks = {
        onChange: vi.fn(),
      }

      await service.watch('/path/to/file.yaml', callbacks, { runOnStart: false })
      service.stop()

      expect(mockWatcher.close).toHaveBeenCalled()
    })

    it('should set watching to false', async () => {
      const callbacks = {
        onChange: vi.fn(),
      }

      await service.watch('/path/to/file.yaml', callbacks, { runOnStart: false })
      expect(service.watching).toBe(true)

      service.stop()
      expect(service.watching).toBe(false)
    })

    it('should clear debounce timer', async () => {
      let watchCallback: (eventType: string, filename: string) => void = () => {}
      fsMocks.watch.mockImplementation((_dir: string, cb: typeof watchCallback) => {
        watchCallback = cb
        return mockWatcher as unknown as FSWatcher
      })

      const callbacks = {
        onChange: vi.fn(),
      }

      await service.watch('/workspace/pnpm-workspace.yaml', callbacks, { runOnStart: false })

      // Trigger change (starts debounce timer)
      watchCallback('change', 'pnpm-workspace.yaml')

      // Stop before debounce completes
      service.stop()

      await vi.advanceTimersByTimeAsync(400)

      // onChange should not be called because we stopped
      expect(callbacks.onChange).not.toHaveBeenCalled()
    })

    it('should not throw when called without active watcher', () => {
      expect(() => service.stop()).not.toThrow()
    })
  })

  describe('watching property', () => {
    it('should return false initially', () => {
      expect(service.watching).toBe(false)
    })

    it('should return true when watching', async () => {
      const callbacks = { onChange: vi.fn() }
      await service.watch('/path/to/file.yaml', callbacks, { runOnStart: false })
      expect(service.watching).toBe(true)
    })

    it('should return false after stop', async () => {
      const callbacks = { onChange: vi.fn() }
      await service.watch('/path/to/file.yaml', callbacks, { runOnStart: false })
      service.stop()
      expect(service.watching).toBe(false)
    })
  })

  describe('restart behavior', () => {
    it('should stop previous watcher when watch is called again', async () => {
      const callbacks1 = { onChange: vi.fn() }
      const callbacks2 = { onChange: vi.fn(), onStart: vi.fn() }

      await service.watch('/path/to/file1.yaml', callbacks1, { runOnStart: false })
      await service.watch('/path/to/file2.yaml', callbacks2, { runOnStart: false })

      // First watcher should be closed
      expect(mockWatcher.close).toHaveBeenCalled()
      // Second onStart should be called
      expect(callbacks2.onStart).toHaveBeenCalled()
    })
  })
})
