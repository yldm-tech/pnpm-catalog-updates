/**
 * Progress Reporter Interface
 *
 * Abstraction for reporting progress during long-running operations.
 * This allows the core application layer to report progress without
 * depending on specific CLI formatting implementations.
 */

export interface ProgressReporter {
  start(message: string, total?: number): void
  update(current: number, message?: string): void
  increment(message?: string): void
  success(message?: string): void
  fail(message?: string): void
  stop(): void
}

export interface ProgressReporterOptions {
  title?: string
  total?: number
  current?: number
}

/**
 * Concurrent Progress Tracker
 *
 * Thread-safe wrapper for progress tracking during parallel operations.
 * Encapsulates atomic counter operations and progress reporter interaction
 * to eliminate fragile shared mutable state in concurrent processing.
 *
 * @example
 * ```typescript
 * const tracker = new ConcurrentProgressTracker(reporter, total);
 * tracker.start('Processing packages');
 *
 * // In parallel operations:
 * await Promise.all(items.map(async (item) => {
 *   await process(item);
 *   tracker.increment(`Processed ${item.name}`);
 * }));
 *
 * tracker.complete('All packages processed');
 * ```
 */
export class ConcurrentProgressTracker {
  private completed = 0
  private readonly lock = new Mutex()

  constructor(
    private readonly reporter: ProgressReporter | null,
    private readonly total: number
  ) {}

  /**
   * Start progress tracking with initial message
   */
  start(message: string): void {
    this.completed = 0
    this.reporter?.start(message, this.total)
  }

  /**
   * Thread-safe increment of progress counter
   * Returns the new completed count for optional use by caller
   */
  async increment(message?: string): Promise<number> {
    return this.lock.runExclusive(() => {
      this.completed++
      this.reporter?.update(this.completed, message)
      return this.completed
    })
  }

  /**
   * Synchronous increment for use in non-async contexts
   * Note: Less safe than async version in highly concurrent scenarios
   */
  incrementSync(message?: string): number {
    this.completed++
    this.reporter?.update(this.completed, message)
    return this.completed
  }

  /**
   * Get current completed count
   */
  getCompleted(): number {
    return this.completed
  }

  /**
   * Mark progress as successfully completed
   */
  success(message?: string): void {
    this.reporter?.success(message)
  }

  /**
   * Mark progress as failed
   */
  fail(message?: string): void {
    this.reporter?.fail(message)
  }

  /**
   * Check if reporter is active
   */
  isActive(): boolean {
    return this.reporter !== null && this.total > 0
  }
}

/**
 * Simple mutex implementation for JavaScript
 * Provides mutual exclusion for async operations
 */
class Mutex {
  private locked = false
  private readonly queue: Array<() => void> = []

  async runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true
        resolve()
      } else {
        this.queue.push(resolve)
      }
    })
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      next?.()
    } else {
      this.locked = false
    }
  }
}
