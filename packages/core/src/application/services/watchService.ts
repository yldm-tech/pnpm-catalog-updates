/**
 * Watch Service
 *
 * Provides file watching capabilities for monitoring pnpm-workspace.yaml changes.
 * Automatically triggers catalog checks when changes are detected.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface WatchOptions {
  /** Debounce delay in milliseconds */
  debounceMs?: number
  /** Initial check on start */
  runOnStart?: boolean
}

export interface WatchCallbacks {
  /** Called when a change is detected */
  onChange: (filePath: string) => Promise<void> | void
  /** Called when an error occurs */
  onError?: (error: Error) => void
  /** Called when watch starts */
  onStart?: () => void
  /** Called when watch stops */
  onStop?: () => void
}

export class WatchService {
  private watcher: fs.FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private isWatching = false
  private readonly defaultDebounceMs = 300

  /**
   * Start watching a file for changes
   */
  async watch(
    filePath: string,
    callbacks: WatchCallbacks,
    options: WatchOptions = {}
  ): Promise<void> {
    const { debounceMs = this.defaultDebounceMs, runOnStart = true } = options

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    // Stop any existing watcher
    this.stop()

    this.isWatching = true
    callbacks.onStart?.()

    // Run initial check if requested
    if (runOnStart) {
      try {
        await callbacks.onChange(filePath)
      } catch (error) {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)))
      }
    }

    // Create file watcher
    const dir = path.dirname(filePath)
    const filename = path.basename(filePath)

    this.watcher = fs.watch(dir, (_eventType, changedFile) => {
      // Only respond to changes in the target file
      if (changedFile !== filename) return

      // Debounce rapid changes
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
      }

      this.debounceTimer = setTimeout(async () => {
        if (!this.isWatching) return

        try {
          await callbacks.onChange(filePath)
        } catch (error) {
          callbacks.onError?.(error instanceof Error ? error : new Error(String(error)))
        }
      }, debounceMs)
    })

    this.watcher.on('error', (error) => {
      callbacks.onError?.(error)
    })
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }

    this.isWatching = false
  }

  /**
   * Check if currently watching
   */
  get watching(): boolean {
    return this.isWatching
  }
}
