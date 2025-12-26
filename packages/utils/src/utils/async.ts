/**
 * Async Utilities
 */

/**
 * Delay execution for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    baseDelay?: number
    maxDelay?: number
    backoffFactor?: number
    shouldRetry?: (error: unknown) => boolean
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    shouldRetry = () => true,
  } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error
      }

      const delayMs = Math.min(baseDelay * backoffFactor ** (attempt - 1), maxDelay)
      await delay(delayMs)
    }
  }

  throw lastError
}

/**
 * Execute functions in parallel with concurrency limit
 *
 * Uses a worker pool pattern where each worker processes items sequentially,
 * but multiple workers run in parallel up to the concurrency limit.
 * This ensures correct concurrent execution without race condition bugs.
 */
export async function parallelLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number = 5
): Promise<R[]> {
  if (items.length === 0) {
    return []
  }

  const results: R[] = new Array(items.length)
  let nextIndex = 0

  // Worker function that processes items one at a time
  const worker = async (): Promise<void> => {
    while (true) {
      // Atomically get the next index to process
      const currentIndex = nextIndex++
      if (currentIndex >= items.length) {
        return
      }

      const item = items[currentIndex]!
      results[currentIndex] = await fn(item, currentIndex)
    }
  }

  // Create workers up to the limit (or item count if smaller)
  const workerCount = Math.min(limit, items.length)
  const workers = Array.from({ length: workerCount }, () => worker())

  await Promise.all(workers)
  return results
}

/**
 * Race with timeout
 */
export async function timeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${ms}ms`))
    }, ms)
  })

  return Promise.race([promise, timeoutPromise])
}

/**
 * Debounce async function
 */
export function debounce<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  ms: number
): (...args: TArgs) => Promise<TReturn> {
  let timeoutId: NodeJS.Timeout
  let latestResolve: ((value: TReturn) => void) | undefined
  let latestReject: ((reason: unknown) => void) | undefined

  return (...args: TArgs): Promise<TReturn> => {
    return new Promise((resolve, reject) => {
      latestResolve = resolve
      latestReject = reject

      clearTimeout(timeoutId)
      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args)
          latestResolve?.(result)
        } catch (error) {
          latestReject?.(error)
        }
      }, ms)
    })
  }
}

/**
 * Throttle async function
 */
export function throttle<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  ms: number
): (...args: TArgs) => Promise<TReturn> {
  let inThrottle = false
  let lastResult: TReturn | undefined

  return async (...args: TArgs): Promise<TReturn> => {
    if (!inThrottle) {
      inThrottle = true
      lastResult = await fn(...args)
      setTimeout(() => {
        inThrottle = false
      }, ms)
    }
    return lastResult as TReturn
  }
}

/**
 * Create a cancelable promise
 */
export function cancelable<T>(promise: Promise<T>): { promise: Promise<T>; cancel: () => void } {
  let isCanceled = false

  const cancelablePromise = new Promise<T>((resolve, reject) => {
    promise
      .then((value) => {
        if (!isCanceled) {
          resolve(value)
        }
      })
      .catch((error) => {
        if (!isCanceled) {
          reject(error)
        }
      })
  })

  return {
    promise: cancelablePromise,
    cancel: () => {
      isCanceled = true
    },
  }
}

/**
 * Execute async function with circuit breaker pattern
 */
export class CircuitBreaker<TArgs extends unknown[], TReturn> {
  private failures = 0
  private lastFailureTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'

  constructor(
    private fn: (...args: TArgs) => Promise<TReturn>,
    private options: {
      failureThreshold?: number
      recoveryTimeout?: number
      monitoringPeriod?: number
    } = {}
  ) {
    const { failureThreshold = 5, recoveryTimeout = 60000, monitoringPeriod = 10000 } = options

    this.options = { failureThreshold, recoveryTimeout, monitoringPeriod }
  }

  async execute(...args: TArgs): Promise<TReturn> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.options.recoveryTimeout!) {
        this.state = 'half-open'
      } else {
        throw new Error('Circuit breaker is open')
      }
    }

    try {
      const result = await this.fn(...args)
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failures = 0
    this.state = 'closed'
  }

  private onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.failures >= this.options.failureThreshold!) {
      this.state = 'open'
    }
  }

  getState(): string {
    return this.state
  }

  reset(): void {
    this.failures = 0
    this.state = 'closed'
    this.lastFailureTime = 0
  }
}

/**
 * Rate limiter using token bucket algorithm
 *
 * Limits the rate of operations to prevent hitting API rate limits.
 * Uses a token bucket algorithm that refills tokens at a fixed rate.
 */
export class RateLimiter {
  private tokens: number
  private lastRefill: number

  /**
   * Create a new rate limiter
   * @param tokensPerSecond Maximum operations per second
   * @param maxBurst Maximum burst size (defaults to 2x tokensPerSecond)
   */
  constructor(
    private readonly tokensPerSecond: number,
    private readonly maxBurst: number = tokensPerSecond * 2
  ) {
    this.tokens = maxBurst
    this.lastRefill = Date.now()
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    const newTokens = elapsed * this.tokensPerSecond
    this.tokens = Math.min(this.maxBurst, this.tokens + newTokens)
    this.lastRefill = now
  }

  /**
   * Wait until a token is available, then consume it
   */
  async acquire(): Promise<void> {
    this.refill()

    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    // Calculate wait time for next token
    const tokensNeeded = 1 - this.tokens
    const waitTimeMs = (tokensNeeded / this.tokensPerSecond) * 1000

    await delay(waitTimeMs)
    this.refill()
    this.tokens -= 1
  }

  /**
   * Try to acquire a token without waiting
   * @returns true if token was acquired, false otherwise
   */
  tryAcquire(): boolean {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }
    return false
  }

  /**
   * Get current available tokens
   */
  getAvailableTokens(): number {
    this.refill()
    return this.tokens
  }
}

/**
 * Execute functions in parallel with both concurrency and rate limiting
 *
 * Combines concurrency control (how many can run at once) with rate limiting
 * (how many can start per second). This prevents overwhelming external APIs.
 *
 * @param items Items to process
 * @param fn Function to apply to each item
 * @param options Concurrency and rate limiting options
 */
export async function parallelLimitWithRateLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: {
    /** Maximum concurrent operations (default: 5) */
    concurrency?: number
    /** Maximum operations per second (default: 10) */
    rateLimit?: number
    /** Maximum burst size (default: 2x rateLimit) */
    maxBurst?: number
  } = {}
): Promise<R[]> {
  const { concurrency = 5, rateLimit = 10, maxBurst } = options

  if (items.length === 0) {
    return []
  }

  const rateLimiter = new RateLimiter(rateLimit, maxBurst ?? rateLimit * 2)
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  // Worker function that processes items one at a time with rate limiting
  const worker = async (): Promise<void> => {
    while (true) {
      // Atomically get the next index to process
      const currentIndex = nextIndex++
      if (currentIndex >= items.length) {
        return
      }

      // Wait for rate limiter before starting work
      await rateLimiter.acquire()

      const item = items[currentIndex]!
      results[currentIndex] = await fn(item, currentIndex)
    }
  }

  // Create workers up to the limit (or item count if smaller)
  const workerCount = Math.min(concurrency, items.length)
  const workers = Array.from({ length: workerCount }, () => worker())

  await Promise.all(workers)
  return results
}

/**
 * Async queue with concurrency control
 * CONC-002: Fixed race condition in process() method
 */
export class AsyncQueue {
  private queue: Array<() => Promise<unknown>> = []
  private running = 0
  // CONC-002: Flag to prevent race condition in process scheduling
  private isProcessing = false

  constructor(private concurrency: number = 1) {}

  async add<R>(fn: () => Promise<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn()
          resolve(result)
          return result
        } catch (error) {
          reject(error)
          throw error
        }
      })

      this.scheduleProcess()
    })
  }

  /**
   * CONC-002: Use synchronous scheduling with queueMicrotask to prevent race conditions
   * This ensures process() is called in a controlled manner without overlapping checks
   */
  private scheduleProcess(): void {
    if (this.isProcessing) {
      return
    }
    this.isProcessing = true

    // Use queueMicrotask to batch process calls and prevent race conditions
    queueMicrotask(() => {
      this.isProcessing = false
      this.processAll()
    })
  }

  /**
   * CONC-002: Process all available slots synchronously to prevent race conditions
   * This method grabs all available work atomically before any async operations
   */
  private processAll(): void {
    // Synchronously claim all available slots
    while (this.running < this.concurrency && this.queue.length > 0) {
      this.running++
      const fn = this.queue.shift()!

      // Start the task (don't await - we want to claim all slots first)
      this.runTask(fn)
    }
  }

  /**
   * CONC-002: Run a single task and schedule more work when done
   */
  private async runTask(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn()
    } finally {
      this.running--
      // Schedule more work after task completes
      this.scheduleProcess()
    }
  }

  size(): number {
    return this.queue.length
  }

  clear(): void {
    this.queue.length = 0
  }

  /**
   * CONC-002: Get current number of running tasks
   */
  getRunning(): number {
    return this.running
  }
}
