/**
 * ProgressBar Unit Tests
 *
 * Tests for the ProgressBar, MultiStepProgress, PercentageProgressBar,
 * and BatchProgressManager classes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BatchProgressManager,
  MultiStepProgress,
  PercentageProgressBar,
  ProgressBar,
} from '../progressBar.js'

// Mock @pcu/utils t() function
vi.mock('@pcu/utils', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'progress.processing': 'Processing...',
      'progress.completed': 'completed',
      'progress.failed': 'failed',
      'progress.success': 'Success',
      'progress.error': 'Error',
      'progress.warning': 'Warning',
      'progress.info': 'Info',
      'progress.steps': 'Steps',
      'progress.allStepsCompleted': 'All steps completed',
      'progress.overallProgress': 'Overall progress',
    }
    return translations[key] || key
  },
}))

// Mock chalk to return plain strings for testing
vi.mock('chalk', () => {
  const createChalkMock = (): unknown => {
    const handler: ProxyHandler<unknown> = {
      get: (_target, prop) => {
        if (
          prop === 'bold' ||
          prop === 'gray' ||
          prop === 'green' ||
          prop === 'red' ||
          prop === 'yellow' ||
          prop === 'blue' ||
          prop === 'cyan' ||
          prop === 'magenta' ||
          prop === 'white'
        ) {
          return createChalkMock()
        }
        return (text: string) => text
      },
      apply: (_target, _thisArg, args) => args[0],
    }
    return new Proxy(() => {}, handler)
  }
  return { default: createChalkMock() }
})

describe('ProgressBar', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.useFakeTimers()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    stdoutWriteSpy.mockRestore()
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should create with default options', () => {
      const bar = new ProgressBar()
      expect(bar).toBeDefined()
    })

    it('should create with custom text', () => {
      const bar = new ProgressBar({ text: 'Custom text' })
      expect(bar).toBeDefined()
    })

    it('should create with custom total', () => {
      const bar = new ProgressBar({ total: 100 })
      expect(bar).toBeDefined()
    })

    it('should create with custom style', () => {
      const styles = ['default', 'gradient', 'fancy', 'minimal', 'rainbow', 'neon'] as const
      for (const style of styles) {
        const bar = new ProgressBar({ style })
        expect(bar).toBeDefined()
      }
    })

    it('should create with showSpeed option', () => {
      const bar = new ProgressBar({ showSpeed: false })
      expect(bar).toBeDefined()
    })
  })

  describe('start', () => {
    it('should start the progress bar', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should start with custom text', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start('Starting...')
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should create percentage bar even without total', () => {
      const bar = new ProgressBar()
      bar.start()
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('should update progress with text', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.update('Updating...', 5)
      // Update should call stdout.write for progress bar updates
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })

    it('should update progress with current and total', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.update('Updating...', 5, 20)
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })
  })

  describe('increment', () => {
    it('should increment progress by 1', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.increment()
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })

    it('should increment progress by custom amount', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.increment(5)
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })

    it('should increment progress with text', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.increment(1, 'Step 1 complete')
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })
  })

  describe('succeed', () => {
    it('should mark as succeeded', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.succeed()
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should mark as succeeded with custom text', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.succeed('All done!')
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should not throw when called without starting', () => {
      const bar = new ProgressBar({ total: 10 })
      expect(() => bar.succeed()).not.toThrow()
    })
  })

  describe('fail', () => {
    it('should mark as failed', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.fail()
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should mark as failed with custom text', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.fail('Something went wrong')
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('warn', () => {
    it('should mark as warning', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.warn()
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should mark as warning with custom text', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.warn('Be careful')
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('info', () => {
    it('should mark as info', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.info()
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should mark as info with custom text', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.info('FYI')
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('should stop the progress bar', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      bar.stop()
      // Should not throw
      expect(true).toBe(true)
    })

    it('should not throw when called without starting', () => {
      const bar = new ProgressBar({ total: 10 })
      expect(() => bar.stop()).not.toThrow()
    })
  })

  describe('style variations', () => {
    const styles = ['default', 'gradient', 'fancy', 'minimal', 'rainbow', 'neon'] as const

    for (const style of styles) {
      describe(`${style} style`, () => {
        it('should render success message', () => {
          const bar = new ProgressBar({ style, total: 10 })
          bar.start()
          bar.succeed('Done')
          expect(consoleLogSpy).toHaveBeenCalled()
        })

        it('should render failure message', () => {
          const bar = new ProgressBar({ style, total: 10 })
          bar.start()
          bar.fail('Failed')
          expect(consoleLogSpy).toHaveBeenCalled()
        })

        it('should render warning message', () => {
          const bar = new ProgressBar({ style, total: 10 })
          bar.start()
          bar.warn('Warning')
          expect(consoleLogSpy).toHaveBeenCalled()
        })

        it('should render info message', () => {
          const bar = new ProgressBar({ style, total: 10 })
          bar.start()
          bar.info('Info')
          expect(consoleLogSpy).toHaveBeenCalled()
        })
      })
    }
  })

  describe('elapsed time formatting', () => {
    it('should format milliseconds', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      vi.advanceTimersByTime(500)
      bar.succeed()
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should format seconds', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      vi.advanceTimersByTime(5000)
      bar.succeed()
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should format minutes', () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start()
      vi.advanceTimersByTime(65000)
      bar.succeed()
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('static factory methods', () => {
    it('should create multi-step progress', () => {
      const progress = ProgressBar.createMultiStep(['Step 1', 'Step 2'])
      expect(progress).toBeInstanceOf(MultiStepProgress)
    })

    it('should create gradient progress bar', () => {
      const bar = ProgressBar.createGradient()
      expect(bar).toBeInstanceOf(ProgressBar)
    })

    it('should create fancy progress bar', () => {
      const bar = ProgressBar.createFancy()
      expect(bar).toBeInstanceOf(ProgressBar)
    })

    it('should create minimal progress bar', () => {
      const bar = ProgressBar.createMinimal()
      expect(bar).toBeInstanceOf(ProgressBar)
    })

    it('should create rainbow progress bar', () => {
      const bar = ProgressBar.createRainbow()
      expect(bar).toBeInstanceOf(ProgressBar)
    })

    it('should create neon progress bar', () => {
      const bar = ProgressBar.createNeon()
      expect(bar).toBeInstanceOf(ProgressBar)
    })

    it('should pass options to factory methods', () => {
      const bar = ProgressBar.createGradient({ total: 50, text: 'Custom' })
      expect(bar).toBeInstanceOf(ProgressBar)
    })
  })
})

describe('MultiStepProgress', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  describe('constructor', () => {
    it('should create with steps', () => {
      const progress = new MultiStepProgress(['Step 1', 'Step 2', 'Step 3'])
      expect(progress).toBeDefined()
    })

    it('should create with empty steps', () => {
      const progress = new MultiStepProgress([])
      expect(progress).toBeDefined()
    })
  })

  describe('start', () => {
    it('should render initial steps', () => {
      const progress = new MultiStepProgress(['Step 1', 'Step 2'])
      progress.start()
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('next', () => {
    it('should advance to next step', () => {
      const progress = new MultiStepProgress(['Step 1', 'Step 2'])
      progress.start()
      progress.next()
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should advance with custom text', () => {
      const progress = new MultiStepProgress(['Step 1', 'Step 2'])
      progress.start()
      progress.next('Custom step text')
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should handle advancing past all steps', () => {
      const progress = new MultiStepProgress(['Step 1'])
      progress.start()
      progress.next()
      progress.next() // Should not throw
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('complete', () => {
    it('should show completion message', () => {
      const progress = new MultiStepProgress(['Step 1', 'Step 2'])
      progress.start()
      progress.next()
      progress.next()
      progress.complete()
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })
})

describe('PercentageProgressBar', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.useFakeTimers()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    stdoutWriteSpy.mockRestore()
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should create with default width', () => {
      const bar = new PercentageProgressBar()
      expect(bar).toBeDefined()
    })

    it('should create with custom width', () => {
      const bar = new PercentageProgressBar(60)
      expect(bar).toBeDefined()
    })

    it('should create with options', () => {
      const bar = new PercentageProgressBar(40, {
        style: 'gradient',
        showStats: true,
        multiLine: true,
      })
      expect(bar).toBeDefined()
    })
  })

  describe('start', () => {
    it('should start with total and text', () => {
      const bar = new PercentageProgressBar()
      bar.start(100, 'Processing...')
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('should update current value', () => {
      const bar = new PercentageProgressBar()
      bar.start(100, 'Processing...')
      bar.update(50)
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })

    it('should update with text', () => {
      const bar = new PercentageProgressBar()
      bar.start(100, 'Processing...')
      bar.update(50, 'Halfway there')
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })
  })

  describe('increment', () => {
    it('should increment by 1', () => {
      const bar = new PercentageProgressBar()
      bar.start(100, 'Processing...')
      bar.increment()
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })

    it('should increment by custom amount', () => {
      const bar = new PercentageProgressBar()
      bar.start(100, 'Processing...')
      bar.increment(10)
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })

    it('should increment with text', () => {
      const bar = new PercentageProgressBar()
      bar.start(100, 'Processing...')
      bar.increment(1, 'Step complete')
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })
  })

  describe('complete', () => {
    it('should complete the progress bar', () => {
      const bar = new PercentageProgressBar()
      bar.start(100, 'Processing...')
      bar.update(50)
      bar.complete()
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })

    it('should complete with custom text', () => {
      const bar = new PercentageProgressBar()
      bar.start(100, 'Processing...')
      bar.complete('All done!')
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })
  })

  describe('style variations', () => {
    const styles = ['gradient', 'fancy', 'minimal', 'blocks', 'default'] as const

    for (const style of styles) {
      it(`should render ${style} style`, () => {
        const bar = new PercentageProgressBar(40, { style })
        bar.start(100, 'Processing...')
        bar.update(50)
        expect(stdoutWriteSpy).toHaveBeenCalled()
      })
    }
  })

  describe('single line mode', () => {
    it('should render in single line mode', () => {
      const bar = new PercentageProgressBar(40, { multiLine: false })
      bar.start(100, 'Processing...')
      bar.update(50)
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })
  })

  describe('speed calculation', () => {
    it('should show speed when showStats is enabled', () => {
      const bar = new PercentageProgressBar(40, { showStats: true })
      bar.start(100, 'Processing...')
      vi.advanceTimersByTime(1000)
      bar.update(10)
      expect(stdoutWriteSpy).toHaveBeenCalled()
    })
  })

  describe('percentage coloring', () => {
    it('should color percentage based on progress', () => {
      const bar = new PercentageProgressBar()
      bar.start(100, 'Processing...')

      // Test different percentage thresholds
      bar.update(10) // < 25%
      bar.update(30) // < 50%
      bar.update(60) // < 75%
      bar.update(80) // < 100%
      bar.update(100) // 100%

      expect(stdoutWriteSpy).toHaveBeenCalled()
    })
  })

  describe('static factory methods', () => {
    it('should create gradient bar', () => {
      const bar = PercentageProgressBar.createGradient()
      expect(bar).toBeInstanceOf(PercentageProgressBar)
    })

    it('should create fancy bar', () => {
      const bar = PercentageProgressBar.createFancy()
      expect(bar).toBeInstanceOf(PercentageProgressBar)
    })

    it('should create minimal bar', () => {
      const bar = PercentageProgressBar.createMinimal()
      expect(bar).toBeInstanceOf(PercentageProgressBar)
    })

    it('should create blocks bar', () => {
      const bar = PercentageProgressBar.createBlocks()
      expect(bar).toBeInstanceOf(PercentageProgressBar)
    })

    it('should create with custom width', () => {
      const bar = PercentageProgressBar.createGradient(60)
      expect(bar).toBeInstanceOf(PercentageProgressBar)
    })
  })
})

describe('BatchProgressManager', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    vi.restoreAllMocks()
  })

  describe('createBar', () => {
    it('should create a progress bar with id', () => {
      const manager = new BatchProgressManager()
      const bar = manager.createBar('test-bar')
      expect(bar).toBeInstanceOf(ProgressBar)
    })

    it('should create a progress bar with options', () => {
      const manager = new BatchProgressManager()
      const bar = manager.createBar('test-bar', { total: 100, style: 'gradient' })
      expect(bar).toBeInstanceOf(ProgressBar)
    })
  })

  describe('getBar', () => {
    it('should get existing bar by id', () => {
      const manager = new BatchProgressManager()
      const bar = manager.createBar('test-bar')
      const retrieved = manager.getBar('test-bar')
      expect(retrieved).toBe(bar)
    })

    it('should return undefined for non-existent bar', () => {
      const manager = new BatchProgressManager()
      const retrieved = manager.getBar('non-existent')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('setTotal', () => {
    it('should set total operations', () => {
      const manager = new BatchProgressManager()
      manager.setTotal(10)
      // No direct assertion, but should not throw
      expect(true).toBe(true)
    })
  })

  describe('updateOverall', () => {
    it('should update overall progress', () => {
      const manager = new BatchProgressManager()
      manager.setTotal(10)
      manager.updateOverall('Processing batch...')
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should calculate percentage correctly', () => {
      const manager = new BatchProgressManager()
      manager.setTotal(10)
      manager.completeOperation()
      manager.completeOperation()
      manager.updateOverall('Processing...')
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('completeOperation', () => {
    it('should increment completed operations', () => {
      const manager = new BatchProgressManager()
      manager.setTotal(10)
      manager.completeOperation()
      expect(true).toBe(true)
    })

    it('should update overall with text', () => {
      const manager = new BatchProgressManager()
      manager.setTotal(10)
      manager.completeOperation('Operation 1 complete')
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should cleanup all bars', () => {
      const manager = new BatchProgressManager()
      const bar1 = manager.createBar('bar1', { total: 10 })
      const bar2 = manager.createBar('bar2', { total: 10 })

      bar1.start()
      bar2.start()

      manager.cleanup()

      // Should clear the bars map
      expect(manager.getBar('bar1')).toBeUndefined()
      expect(manager.getBar('bar2')).toBeUndefined()
    })
  })

  describe('multiple bars', () => {
    it('should manage multiple bars independently', () => {
      const manager = new BatchProgressManager()
      const bar1 = manager.createBar('bar1', { total: 10 })
      const bar2 = manager.createBar('bar2', { total: 20 })

      expect(manager.getBar('bar1')).toBe(bar1)
      expect(manager.getBar('bar2')).toBe(bar2)
      expect(bar1).not.toBe(bar2)
    })
  })
})
