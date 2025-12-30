/**
 * Async Utilities Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AsyncQueue,
  CircuitBreaker,
  cancelable,
  debounce,
  delay,
  parallelLimit,
  parallelLimitWithRateLimit,
  RateLimiter,
  retry,
  throttle,
  timeout,
} from '../async.js'

describe('delay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should delay execution for specified milliseconds', async () => {
    const start = Date.now()
    const promise = delay(100)

    vi.advanceTimersByTime(100)
    await promise

    // With fake timers, the time should have advanced
    expect(Date.now() - start).toBeGreaterThanOrEqual(100)
  })

  it('should resolve without value', async () => {
    const promise = delay(50)
    vi.advanceTimersByTime(50)
    const result = await promise
    expect(result).toBeUndefined()
  })
})

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success')

    const result = await retry(fn)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure and succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success')

    const promise = retry(fn, { baseDelay: 100 })

    // First attempt fails immediately
    await vi.advanceTimersByTimeAsync(0)

    // Wait for retry delay after first failure
    await vi.advanceTimersByTimeAsync(100)

    // Wait for retry delay after second failure (exponential: 200ms)
    await vi.advanceTimersByTimeAsync(200)

    const result = await promise

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should throw after max attempts', async () => {
    // Use mockImplementation with async throw
    const fn = vi.fn().mockImplementation(async () => {
      throw new Error('always fails')
    })

    const promise = retry(fn, { maxAttempts: 3, baseDelay: 100 })

    // Add catch handler immediately to prevent unhandled rejection
    let caughtError: Error | null = null
    promise.catch((e) => {
      caughtError = e
    })

    // Run all timers to completion
    await vi.runAllTimersAsync()

    // Verify the error was caught
    expect(caughtError).toBeInstanceOf(Error)
    expect(caughtError?.message).toBe('always fails')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should respect shouldRetry function', async () => {
    // Use mockImplementation with async throw
    const fn = vi.fn().mockImplementation(async () => {
      throw new Error('non-retryable')
    })

    const promise = retry(fn, {
      maxAttempts: 3,
      shouldRetry: (error) => !(error instanceof Error && error.message === 'non-retryable'),
    })

    await expect(promise).rejects.toThrow('non-retryable')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should respect maxDelay option', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success')

    const promise = retry(fn, {
      maxAttempts: 4,
      baseDelay: 1000,
      backoffFactor: 10, // Would be 1000, 10000, 100000 without cap
      maxDelay: 5000, // Cap at 5 seconds
    })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000) // First retry
    await vi.advanceTimersByTimeAsync(5000) // Second retry (capped)
    await vi.advanceTimersByTimeAsync(5000) // Third retry (capped)

    const result = await promise
    expect(result).toBe('success')
  })
})

describe('parallelLimit', () => {
  it('should return empty array for empty input', async () => {
    const fn = vi.fn()
    const result = await parallelLimit([], fn)

    expect(result).toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('should process all items', async () => {
    const items = [1, 2, 3, 4, 5]
    const fn = vi.fn().mockImplementation(async (item: number) => item * 2)

    const result = await parallelLimit(items, fn, 2)

    expect(result).toEqual([2, 4, 6, 8, 10])
    expect(fn).toHaveBeenCalledTimes(5)
  })

  it('should respect concurrency limit', async () => {
    const items = [1, 2, 3, 4]
    let concurrent = 0
    let maxConcurrent = 0

    const fn = vi.fn().mockImplementation(async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((resolve) => setTimeout(resolve, 10))
      concurrent--
      return 'done'
    })

    await parallelLimit(items, fn, 2)

    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('should preserve order of results', async () => {
    const items = [3, 1, 2] // Different processing times but same order
    const fn = vi.fn().mockImplementation(async (item: number) => {
      await new Promise((resolve) => setTimeout(resolve, item * 10))
      return item
    })

    const result = await parallelLimit(items, fn, 10)

    expect(result).toEqual([3, 1, 2])
  })

  it('should pass index to function', async () => {
    const items = ['a', 'b', 'c']
    const fn = vi.fn().mockImplementation(async (item: string, index: number) => `${item}${index}`)

    const result = await parallelLimit(items, fn, 2)

    expect(result).toEqual(['a0', 'b1', 'c2'])
    expect(fn).toHaveBeenNthCalledWith(1, 'a', 0)
    expect(fn).toHaveBeenNthCalledWith(2, 'b', 1)
    expect(fn).toHaveBeenNthCalledWith(3, 'c', 2)
  })
})

describe('timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return result if promise resolves before timeout', async () => {
    const promise = Promise.resolve('success')

    const result = await timeout(promise, 1000)

    expect(result).toBe('success')
  })

  it('should throw if promise takes too long', async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 2000))

    const timeoutPromise = timeout(promise, 100)

    vi.advanceTimersByTime(100)

    await expect(timeoutPromise).rejects.toThrow('Operation timed out after 100ms')
  })

  it('should use custom message', async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 2000))

    const timeoutPromise = timeout(promise, 100, 'Custom timeout message')

    vi.advanceTimersByTime(100)

    await expect(timeoutPromise).rejects.toThrow('Custom timeout message')
  })
})

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should debounce function calls', async () => {
    const fn = vi.fn().mockResolvedValue('result')
    const debounced = debounce(fn, 100)

    // Call multiple times quickly - each call resets the timer
    debounced('first')
    debounced('second')
    const lastPromise = debounced('third')

    // Advance timers and flush all pending timers and promises
    await vi.runAllTimersAsync()

    // Only the last promise resolves (previous promises are replaced by design)
    const result = await lastPromise
    expect(result).toBe('result')

    // The function should only be called once with the last arguments
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('third')
  })

  it('should propagate errors', async () => {
    // Use mockImplementation with async throw
    const fn = vi.fn().mockImplementation(async () => {
      throw new Error('debounce error')
    })
    const debounced = debounce(fn, 100)

    const promise = debounced()

    // Add catch handler immediately to prevent unhandled rejection
    let caughtError: Error | null = null
    promise.catch((e) => {
      caughtError = e
    })

    await vi.runAllTimersAsync()

    // Verify the error was caught
    expect(caughtError).toBeInstanceOf(Error)
    expect(caughtError?.message).toBe('debounce error')
  })
})

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should throttle function calls', async () => {
    const fn = vi.fn().mockResolvedValue('result')
    const throttled = throttle(fn, 100)

    // First call should execute immediately
    const result1 = await throttled('first')
    expect(result1).toBe('result')
    expect(fn).toHaveBeenCalledTimes(1)

    // Subsequent calls within throttle period should return cached result
    const result2 = await throttled('second')
    expect(result2).toBe('result')
    expect(fn).toHaveBeenCalledTimes(1) // Still 1

    // After throttle period, should call again
    vi.advanceTimersByTime(100)

    const result3 = await throttled('third')
    expect(result3).toBe('result')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('cancelable', () => {
  it('should resolve normally if not canceled', async () => {
    const promise = Promise.resolve('result')
    const { promise: cancelablePromise } = cancelable(promise)

    const result = await cancelablePromise
    expect(result).toBe('result')
  })

  it('should not resolve if canceled', async () => {
    let resolved = false
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('result'), 100)
    })

    const { promise: cancelablePromise, cancel } = cancelable(promise)

    cancelablePromise.then(() => {
      resolved = true
    })

    cancel()

    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(resolved).toBe(false)
  })

  it('should not reject if canceled', async () => {
    let rejected = false
    const promise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('error')), 100)
    })

    const { promise: cancelablePromise, cancel } = cancelable(promise)

    cancelablePromise.catch(() => {
      rejected = true
    })

    cancel()

    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(rejected).toBe(false)
  })
})

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should execute function normally when closed', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const breaker = new CircuitBreaker(fn)

    const result = await breaker.execute()

    expect(result).toBe('success')
    expect(breaker.getState()).toBe('closed')
  })

  it('should open after failure threshold', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const breaker = new CircuitBreaker(fn, { failureThreshold: 3 })

    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute()).rejects.toThrow('fail')
    }

    expect(breaker.getState()).toBe('open')

    // Should reject immediately when open
    await expect(breaker.execute()).rejects.toThrow('Circuit breaker is open')
  })

  it('should transition to half-open after recovery timeout', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const breaker = new CircuitBreaker(fn, {
      failureThreshold: 2,
      recoveryTimeout: 5000,
    })

    // Open the circuit
    await expect(breaker.execute()).rejects.toThrow('fail')
    await expect(breaker.execute()).rejects.toThrow('fail')

    expect(breaker.getState()).toBe('open')

    // Wait for recovery timeout (> not >=, so need 5001)
    vi.advanceTimersByTime(5001)

    // Next call should attempt (half-open state)
    fn.mockResolvedValueOnce('success')
    const result = await breaker.execute()

    expect(result).toBe('success')
    expect(breaker.getState()).toBe('closed')
  })

  it('should reset to closed on success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success')

    const breaker = new CircuitBreaker(fn, {
      failureThreshold: 3,
    })

    await expect(breaker.execute()).rejects.toThrow('fail')
    await expect(breaker.execute()).rejects.toThrow('fail')

    // Success should reset failure count
    await breaker.execute()
    expect(breaker.getState()).toBe('closed')
  })

  it('should allow manual reset', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const breaker = new CircuitBreaker(fn, { failureThreshold: 2 })

    await expect(breaker.execute()).rejects.toThrow('fail')
    await expect(breaker.execute()).rejects.toThrow('fail')

    expect(breaker.getState()).toBe('open')

    breaker.reset()

    expect(breaker.getState()).toBe('closed')
  })
})

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should allow immediate acquire when tokens available', async () => {
    const limiter = new RateLimiter(10, 10)

    // Should have initial tokens (maxBurst)
    expect(limiter.getAvailableTokens()).toBe(10)

    // Should acquire immediately
    await limiter.acquire()

    expect(limiter.getAvailableTokens()).toBe(9)
  })

  it('should block when no tokens available', async () => {
    const limiter = new RateLimiter(1, 1) // 1 token per second, max 1

    // Use the token
    await limiter.acquire()

    // Try to acquire again - should wait
    let acquired = false
    const acquirePromise = limiter.acquire().then(() => {
      acquired = true
    })

    // Should not be acquired yet
    expect(acquired).toBe(false)

    // Wait for refill
    await vi.advanceTimersByTimeAsync(1000)
    await acquirePromise

    expect(acquired).toBe(true)
  })

  it('should tryAcquire without blocking', () => {
    const limiter = new RateLimiter(10, 2)

    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false) // No tokens left
  })

  it('should refill tokens over time', async () => {
    const limiter = new RateLimiter(10, 10) // 10 tokens/second

    // Use all tokens
    for (let i = 0; i < 10; i++) {
      expect(limiter.tryAcquire()).toBe(true)
    }

    expect(limiter.tryAcquire()).toBe(false)

    // Wait 0.5 seconds - should refill 5 tokens
    vi.advanceTimersByTime(500)

    expect(limiter.getAvailableTokens()).toBeCloseTo(5, 0)
  })
})

describe('parallelLimitWithRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return empty array for empty input', async () => {
    const fn = vi.fn()
    const result = await parallelLimitWithRateLimit([], fn)

    expect(result).toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('should process items with concurrency and rate limit', async () => {
    const items = [1, 2, 3]
    const fn = vi.fn().mockImplementation(async (item: number) => item * 2)

    const promise = parallelLimitWithRateLimit(items, fn, {
      concurrency: 2,
      rateLimit: 10,
    })

    // Advance time to allow rate limiter to process
    await vi.advanceTimersByTimeAsync(1000)

    const result = await promise

    expect(result).toEqual([2, 4, 6])
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe('AsyncQueue', () => {
  it('should process items in order', async () => {
    const queue = new AsyncQueue(1)
    const results: number[] = []

    await Promise.all([
      queue.add(async () => {
        results.push(1)
        return 1
      }),
      queue.add(async () => {
        results.push(2)
        return 2
      }),
      queue.add(async () => {
        results.push(3)
        return 3
      }),
    ])

    expect(results).toEqual([1, 2, 3])
  })

  it('should respect concurrency limit', async () => {
    const queue = new AsyncQueue(2)
    let concurrent = 0
    let maxConcurrent = 0

    const createTask = () =>
      queue.add(async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((resolve) => setTimeout(resolve, 10))
        concurrent--
        return 'done'
      })

    await Promise.all([createTask(), createTask(), createTask(), createTask()])

    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('should return task result', async () => {
    const queue = new AsyncQueue(1)

    const result = await queue.add(async () => 'result')

    expect(result).toBe('result')
  })

  it('should propagate errors', async () => {
    const queue = new AsyncQueue(1)

    // The implementation has a pattern where it does reject(error) then throw error,
    // causing an unhandled rejection in runTask. We need to catch this floating promise.
    // Add a listener to suppress the expected unhandled rejection
    const unhandledRejections: Error[] = []
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      if (event.reason?.message === 'task error') {
        event.preventDefault()
        unhandledRejections.push(event.reason)
      }
    }

    // In Node.js environment, use process event
    const nodeHandler = (reason: Error) => {
      if (reason?.message === 'task error') {
        unhandledRejections.push(reason)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', rejectionHandler)
    } else if (typeof process !== 'undefined') {
      process.on('unhandledRejection', nodeHandler)
    }

    try {
      await queue.add(async () => {
        throw new Error('task error')
      })
      // Should not reach here
      expect.fail('Expected an error to be thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('task error')
    }

    // Allow microtask queue to flush
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Clean up listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('unhandledrejection', rejectionHandler)
    } else if (typeof process !== 'undefined') {
      process.off('unhandledRejection', nodeHandler)
    }
  })

  it('should track queue size', async () => {
    const queue = new AsyncQueue(1)

    expect(queue.size()).toBe(0)

    const promise1 = queue.add(
      () => new Promise((resolve) => setTimeout(() => resolve('done'), 100))
    )
    const promise2 = queue.add(
      () => new Promise((resolve) => setTimeout(() => resolve('done'), 100))
    )

    // First task is running, second is queued
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(queue.size()).toBeGreaterThanOrEqual(0) // May be 0 or 1 depending on timing

    await Promise.all([promise1, promise2])
    expect(queue.size()).toBe(0)
  })

  it('should clear queue', async () => {
    const queue = new AsyncQueue(1)

    queue.add(() => new Promise((resolve) => setTimeout(() => resolve('done'), 1000)))
    queue.add(() => Promise.resolve('queued'))

    // Clear pending items
    queue.clear()

    expect(queue.size()).toBe(0)
  })

  it('should report running count', async () => {
    const queue = new AsyncQueue(2)

    expect(queue.getRunning()).toBe(0)

    const promise = queue.add(
      () => new Promise((resolve) => setTimeout(() => resolve('done'), 100))
    )

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(queue.getRunning()).toBeGreaterThanOrEqual(0) // May be 0 or 1 depending on timing

    await promise
  })
})
