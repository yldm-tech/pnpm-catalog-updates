/**
 * Unified Command Executor
 *
 * Provides consistent command execution across the codebase with:
 * - Configurable timeout and retry
 * - Consistent error handling
 * - Both sync and async execution modes
 * - Stream and buffer output options
 */

import {
  type ChildProcess,
  exec as execCallback,
  type SpawnOptions,
  spawn,
  spawnSync,
} from 'node:child_process'
import { promisify } from 'node:util'

const execPromise = promisify(execCallback)

/**
 * Result of command execution
 */
export interface CommandResult {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  error?: Error
  /** Time taken to execute the command in milliseconds */
  durationMs?: number
}

/**
 * Options for command execution
 */
export interface CommandOptions {
  /** Working directory for the command */
  cwd?: string
  /** Timeout in milliseconds (default: 30000 = 30 seconds) */
  timeout?: number
  /** Number of retry attempts (default: 0) */
  retries?: number
  /** Base delay for exponential backoff in milliseconds (default: 1000) */
  retryDelay?: number
  /** Environment variables to add/override */
  env?: NodeJS.ProcessEnv
  /** Maximum buffer size in bytes (default: 10MB) */
  maxBuffer?: number
  /** Shell to use for execution */
  shell?: string | boolean
  /** Whether to inherit stdio (for verbose/streaming output) */
  inheritStdio?: boolean
  /** Signal to use when killing on timeout (default: 'SIGTERM') */
  killSignal?: NodeJS.Signals
}

/**
 * Default options for command execution
 */
const DEFAULT_OPTIONS: Required<Omit<CommandOptions, 'cwd' | 'env' | 'shell'>> = {
  timeout: 30000,
  retries: 0,
  retryDelay: 1000,
  maxBuffer: 10 * 1024 * 1024, // 10MB
  inheritStdio: false,
  killSignal: 'SIGTERM',
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, baseDelay: number): number {
  return baseDelay * 2 ** (attempt - 1)
}

/**
 * Shell-safe argument escaping for command execution.
 *
 * SECURITY: This function escapes shell metacharacters to prevent command injection.
 * Always use this when building shell command strings.
 *
 * @param arg - The argument to escape
 * @returns The escaped argument safe for shell execution
 */
export function escapeShellArg(arg: string): string {
  // If the argument is empty, return empty quoted string
  if (!arg) {
    return '""'
  }

  // On Windows, use double quotes and escape internal double quotes
  if (process.platform === 'win32') {
    // Escape double quotes and wrap in double quotes
    // Windows cmd.exe doesn't have the same metacharacter issues as Unix shells
    return `"${arg.replace(/"/g, '\\"')}"`
  }

  // On Unix (bash/sh), use single quotes which prevent all interpretation
  // except for single quotes themselves, which we handle by ending the quote,
  // adding an escaped single quote, and starting a new quote
  // Example: "foo'bar" becomes 'foo'\''bar'
  if (!/[^a-zA-Z0-9_\-./=@:]/.test(arg)) {
    // Safe characters only, no escaping needed
    return arg
  }

  // Use single quotes for safety, escape any single quotes within
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * Build a safe command string from command and arguments.
 *
 * SECURITY: Uses escapeShellArg to prevent command injection.
 *
 * @param command - The command to execute
 * @param args - Arguments for the command
 * @returns A safely escaped command string
 */
export function buildSafeCommand(command: string, args: string[]): string {
  if (args.length === 0) {
    return command
  }
  return `${command} ${args.map(escapeShellArg).join(' ')}`
}

/**
 * Execute a command asynchronously
 *
 * @param command - The command to execute
 * @param args - Arguments for the command (optional, can include in command string)
 * @param options - Execution options
 * @returns Promise resolving to CommandResult
 *
 * @example
 * // Simple command
 * const result = await executeCommand('git', ['status'])
 *
 * // With timeout and retries
 * const result = await executeCommand('npm', ['install'], {
 *   timeout: 60000,
 *   retries: 2,
 *   cwd: '/path/to/project'
 * })
 *
 * // Shell command (when args are embedded)
 * const result = await executeCommand('npm view package version', [], { shell: true })
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  options: CommandOptions = {}
): Promise<CommandResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const startTime = Date.now()
  let lastError: Error | null = null
  const maxAttempts = opts.retries + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await executeOnce(command, args, opts)
      result.durationMs = Date.now() - startTime
      return result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxAttempts) {
        const delay = getBackoffDelay(attempt, opts.retryDelay)
        await sleep(delay)
      }
    }
  }

  // All retries exhausted
  return {
    success: false,
    code: null,
    stdout: '',
    stderr: lastError?.message || 'Command execution failed',
    error: lastError ?? new Error('Command execution failed'),
    durationMs: Date.now() - startTime,
  }
}

/**
 * Execute command once (internal)
 */
async function executeOnce(
  command: string,
  args: string[],
  opts: Required<Omit<CommandOptions, 'cwd' | 'env' | 'shell'>> & CommandOptions
): Promise<CommandResult> {
  // If using inheritStdio, use spawn for streaming
  if (opts.inheritStdio) {
    return executeWithSpawn(command, args, opts)
  }

  // Use exec for buffered output (simpler for most cases)
  return executeWithExec(command, args, opts)
}

/**
 * Execute using exec (buffered output)
 */
async function executeWithExec(
  command: string,
  args: string[],
  opts: Required<Omit<CommandOptions, 'cwd' | 'env' | 'shell'>> & CommandOptions
): Promise<CommandResult> {
  // Build full command string using safe escaping
  const fullCommand = buildSafeCommand(command, args)

  try {
    const { stdout, stderr } = await execPromise(fullCommand, {
      timeout: opts.timeout,
      maxBuffer: opts.maxBuffer,
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env, NO_COLOR: '1' },
      shell: typeof opts.shell === 'string' ? opts.shell : undefined,
      killSignal: opts.killSignal,
    })

    return {
      success: true,
      code: 0,
      stdout: stdout || '',
      stderr: stderr || '',
    }
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string
      stderr?: string
      code?: number
      killed?: boolean
      signal?: string
    }

    // Check if it's a timeout error (process was killed)
    if (execError.killed) {
      return {
        success: false,
        code: null,
        stdout: execError.stdout || '',
        stderr: execError.stderr || '',
        error: new Error(`Command timed out after ${opts.timeout}ms`),
      }
    }

    return {
      success: false,
      code: typeof execError.code === 'number' ? execError.code : null,
      stdout: execError.stdout || '',
      stderr: execError.stderr || execError.message || '',
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

/**
 * Execute using spawn (for streaming/inherit stdio)
 */
async function executeWithSpawn(
  command: string,
  args: string[],
  opts: Required<Omit<CommandOptions, 'cwd' | 'env' | 'shell'>> & CommandOptions
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const spawnOpts: SpawnOptions = {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: opts.inheritStdio ? 'inherit' : 'pipe',
      shell: opts.shell,
    }

    let childProcess: ChildProcess
    try {
      childProcess = spawn(command, args, spawnOpts)
    } catch (error) {
      resolve({
        success: false,
        code: null,
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error : new Error(String(error)),
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let timeoutId: NodeJS.Timeout | undefined

    // Capture output if not inheriting stdio
    if (!opts.inheritStdio && childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
    }

    if (!opts.inheritStdio && childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })
    }

    // Set up timeout
    if (opts.timeout > 0) {
      timeoutId = setTimeout(() => {
        childProcess.kill(opts.killSignal)
        resolve({
          success: false,
          code: null,
          stdout,
          stderr,
          error: new Error(`Command timed out after ${opts.timeout}ms`),
        })
      }, opts.timeout)
    }

    childProcess.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      resolve({
        success: code === 0,
        code,
        stdout,
        stderr,
      })
    })

    childProcess.on('error', (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      resolve({
        success: false,
        code: null,
        stdout,
        stderr,
        error,
      })
    })
  })
}

/**
 * Execute a command synchronously
 *
 * @param command - The command to execute
 * @param args - Arguments for the command
 * @param options - Execution options (timeout, cwd, env)
 * @returns CommandResult
 *
 * @example
 * const result = executeCommandSync('git', ['branch', '--show-current'])
 * if (result.success) {
 *   console.log('Branch:', result.stdout.trim())
 * }
 */
export function executeCommandSync(
  command: string,
  args: string[] = [],
  options: Pick<CommandOptions, 'cwd' | 'timeout' | 'env' | 'shell'> = {}
): CommandResult {
  try {
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: options.timeout,
      env: { ...process.env, ...options.env },
      shell: options.shell,
    })

    if (result.error) {
      return {
        success: false,
        code: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        error: result.error,
      }
    }

    return {
      success: result.status === 0,
      code: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    }
  } catch (error) {
    return {
      success: false,
      code: null,
      stdout: '',
      stderr: '',
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

/**
 * Check if a command exists in PATH
 *
 * @param command - The command to check
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns Promise resolving to the command path if found, null otherwise
 */
export async function whichCommand(
  command: string,
  timeout: number = 5000
): Promise<string | null> {
  const isWindows = process.platform === 'win32'
  const whichCmd = isWindows ? 'where' : 'which'

  const result = await executeCommand(whichCmd, [command], { timeout })

  if (result.success && result.stdout.trim()) {
    // Return first line (path) for both Windows and Unix
    return result.stdout.trim().split('\n')[0] || null
  }

  return null
}

/**
 * Get version of a command (runs command --version)
 *
 * @param command - The command to check version for
 * @param versionArg - Version argument (default: '--version')
 * @param timeout - Timeout in milliseconds (default: 10000)
 * @returns Promise resolving to version string if found, null otherwise
 */
export async function getCommandVersion(
  command: string,
  versionArg: string = '--version',
  timeout: number = 10000
): Promise<string | null> {
  const result = await executeCommand(command, [versionArg], { timeout })

  const output = result.stdout || result.stderr
  if (!output) return null

  // Extract version number (e.g., "1.2.3", "v1.2.3")
  const versionMatch = output.match(/v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/)
  return versionMatch ? versionMatch[1] || null : output.trim().slice(0, 50) || null
}
