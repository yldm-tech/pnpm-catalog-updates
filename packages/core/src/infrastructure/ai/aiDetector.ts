/**
 * AI Detector Service
 *
 * Automatically detects available AI CLI tools on the system.
 * Supports multiple detection strategies: which, alias, env vars, known paths.
 */

import { exec as execCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type { AIProviderInfo, AnalysisType } from '../../domain/interfaces/aiProvider.js'

const exec = promisify(execCallback)

/**
 * Detection result for a single provider
 */
interface DetectionResult {
  found: boolean
  path?: string
  version?: string
  detectionMethod?: 'which' | 'alias' | 'envvar' | 'known-path' | 'application'
}

/**
 * Provider definition for detection
 */
interface ProviderDefinition {
  name: string
  command: string
  envVar?: string
  knownPaths: string[]
  applicationPaths?: string[] // For GUI applications like Cursor
  versionArg: string
  priority: number
  capabilities: AnalysisType[]
}

/**
 * AI Detector - Detects available AI CLI tools on the system
 */
export class AIDetector {
  private readonly providers: ProviderDefinition[]
  private readonly isWindows: boolean
  private readonly homeDir: string

  constructor() {
    this.isWindows = platform() === 'win32'
    this.homeDir = homedir()
    this.providers = this.initializeProviders()
  }

  /**
   * Initialize provider definitions
   */
  private initializeProviders(): ProviderDefinition[] {
    // Unix paths
    const npmGlobalBin = join(this.homeDir, '.npm-global', 'bin')
    const localBin = '/usr/local/bin'
    const homebrewBin = '/opt/homebrew/bin'
    // Intel Homebrew uses /usr/local/bin which is already covered by localBin

    // Windows paths
    const appData = process.env.APPDATA || join(this.homeDir, 'AppData', 'Roaming')
    const localAppData = process.env.LOCALAPPDATA || join(this.homeDir, 'AppData', 'Local')
    const windowsNpmGlobal = join(appData, 'npm')
    const windowsProgramFiles = process.env.ProgramFiles || 'C:\\Program Files'

    // Build platform-specific known paths
    const getKnownPaths = (command: string): string[] => {
      if (this.isWindows) {
        return [
          join(windowsNpmGlobal, `${command}.cmd`),
          join(windowsNpmGlobal, command),
          join(localAppData, 'Programs', command, `${command}.exe`),
          join(windowsProgramFiles, command, `${command}.exe`),
          join(this.homeDir, '.npm-global', 'bin', `${command}.cmd`),
        ]
      }
      return [
        join(homebrewBin, command),
        join(localBin, command),
        join(npmGlobalBin, command),
        join(this.homeDir, '.local', 'bin', command),
      ]
    }

    // Priority order: gemini > claude > codex > cursor
    return [
      {
        name: 'gemini',
        command: 'gemini',
        envVar: 'GEMINI_PATH',
        knownPaths: getKnownPaths('gemini'),
        versionArg: '--version',
        priority: 100,
        capabilities: ['impact', 'security', 'compatibility', 'recommend'],
      },
      {
        name: 'claude',
        command: 'claude',
        envVar: 'CLAUDE_PATH',
        knownPaths: getKnownPaths('claude'),
        versionArg: '--version',
        priority: 80,
        capabilities: ['impact', 'security', 'compatibility', 'recommend'],
      },
      {
        name: 'codex',
        command: 'codex',
        envVar: 'CODEX_PATH',
        knownPaths: getKnownPaths('codex'),
        versionArg: '--version',
        priority: 60,
        capabilities: ['impact', 'compatibility', 'recommend'],
      },
      {
        name: 'cursor',
        command: 'cursor',
        envVar: 'CURSOR_PATH',
        knownPaths: this.isWindows
          ? [
              join(localAppData, 'Programs', 'cursor', 'Cursor.exe'),
              join(windowsProgramFiles, 'Cursor', 'Cursor.exe'),
            ]
          : [join(homebrewBin, 'cursor'), join(localBin, 'cursor')],
        applicationPaths: this.isWindows
          ? [join(localAppData, 'Programs', 'cursor', 'Cursor.exe')]
          : ['/Applications/Cursor.app/Contents/MacOS/Cursor'],
        versionArg: '--version',
        priority: 40,
        capabilities: ['impact', 'recommend'],
      },
    ]
  }

  /**
   * Detect all available AI providers
   */
  async detectAvailableProviders(): Promise<AIProviderInfo[]> {
    const results: AIProviderInfo[] = []

    for (const provider of this.providers) {
      const detection = await this.detectProvider(provider)

      results.push({
        name: provider.name,
        version: detection.version,
        path: detection.path,
        available: detection.found,
        priority: detection.found ? provider.priority : 0,
        capabilities: provider.capabilities,
      })
    }

    // Sort by priority (descending) and filter available
    return results.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Get only available providers
   */
  async getAvailableProviders(): Promise<AIProviderInfo[]> {
    const all = await this.detectAvailableProviders()
    return all.filter((p) => p.available)
  }

  /**
   * Check if a specific provider is available
   */
  async isProviderAvailable(providerName: string): Promise<boolean> {
    const provider = this.providers.find((p) => p.name === providerName)
    if (!provider) {
      return false
    }

    const detection = await this.detectProvider(provider)
    return detection.found
  }

  /**
   * Get the best available provider
   */
  async getBestProvider(): Promise<AIProviderInfo | null> {
    const available = await this.getAvailableProviders()
    return available.length > 0 ? available[0]! : null
  }

  /**
   * Get provider by name
   */
  async getProvider(name: string): Promise<AIProviderInfo | null> {
    const provider = this.providers.find((p) => p.name === name)
    if (!provider) {
      return null
    }

    const detection = await this.detectProvider(provider)
    return {
      name: provider.name,
      version: detection.version,
      path: detection.path,
      available: detection.found,
      priority: detection.found ? provider.priority : 0,
      capabilities: provider.capabilities,
    }
  }

  /**
   * Detect a single provider using multiple strategies
   */
  private async detectProvider(provider: ProviderDefinition): Promise<DetectionResult> {
    // Strategy 1: Check environment variable
    if (provider.envVar) {
      const envPath = process.env[provider.envVar]
      if (envPath && this.fileExists(envPath)) {
        const version = await this.getVersion(envPath, provider.versionArg)
        return { found: true, path: envPath, version, detectionMethod: 'envvar' }
      }
    }

    // Strategy 2: Use 'which' command (Unix) or 'where' (Windows)
    const whichResult = await this.detectByWhich(provider.command)
    if (whichResult) {
      const version = await this.getVersion(whichResult, provider.versionArg)
      return { found: true, path: whichResult, version, detectionMethod: 'which' }
    }

    // Strategy 3: Check for alias (Unix only)
    if (!this.isWindows) {
      const aliasResult = await this.detectByAlias(provider.command)
      if (aliasResult) {
        const version = await this.getVersion(provider.command, provider.versionArg)
        return { found: true, path: 'alias', version, detectionMethod: 'alias' }
      }
    }

    // Strategy 4: Check known paths
    for (const knownPath of provider.knownPaths) {
      if (this.fileExists(knownPath)) {
        const version = await this.getVersion(knownPath, provider.versionArg)
        return { found: true, path: knownPath, version, detectionMethod: 'known-path' }
      }
    }

    // Strategy 5: Check application paths (for GUI apps like Cursor)
    if (provider.applicationPaths) {
      for (const appPath of provider.applicationPaths) {
        if (this.fileExists(appPath)) {
          return { found: true, path: appPath, detectionMethod: 'application' }
        }
      }
    }

    return { found: false }
  }

  /**
   * Detect using 'which' (Unix) or 'where' (Windows)
   */
  private async detectByWhich(command: string): Promise<string | null> {
    try {
      const whichCommand = this.isWindows ? 'where' : 'which'
      const { stdout } = await exec(`${whichCommand} ${command}`, { timeout: 5000 })
      const path = stdout.trim().split('\n')[0]
      return path && path.length > 0 ? path : null
    } catch {
      return null
    }
  }

  /**
   * Detect by checking if command is an alias
   */
  private async detectByAlias(command: string): Promise<boolean> {
    try {
      // Check using non-interactive shell to avoid hanging
      // Note: This won't detect aliases defined in ~/.bashrc, but avoids process hanging
      const { stdout } = await exec(`type ${command} 2>/dev/null`, {
        timeout: 3000,
        shell: '/bin/bash',
      })
      return stdout.includes('alias') || stdout.includes('function')
    } catch {
      return false
    }
  }

  /**
   * Get version of a command
   */
  private async getVersion(commandOrPath: string, versionArg: string): Promise<string | undefined> {
    try {
      const { stdout, stderr } = await exec(`"${commandOrPath}" ${versionArg}`, {
        timeout: 10000,
      })
      // Version might be in stdout or stderr
      const output = stdout || stderr
      // Extract version number (e.g., "1.2.3", "v1.2.3")
      const versionMatch = output.match(/v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/)
      return versionMatch ? versionMatch[1] : output.trim().slice(0, 50)
    } catch {
      return undefined
    }
  }

  /**
   * Check if a file exists
   */
  private fileExists(path: string): boolean {
    try {
      // Expand ~ to home directory
      const expandedPath = path.startsWith('~') ? join(this.homeDir, path.slice(1)) : path
      return existsSync(expandedPath)
    } catch {
      return false
    }
  }

  /**
   * Get detection summary for logging/display
   */
  async getDetectionSummary(): Promise<string> {
    const providers = await this.detectAvailableProviders()
    const available = providers.filter((p) => p.available)

    if (available.length === 0) {
      return ''
    }

    const lines = ['Available AI tools:']
    for (const provider of available) {
      const version = provider.version ? ` (${provider.version})` : ''
      const path = provider.path ? ` at ${provider.path}` : ''
      lines.push(`  - ${provider.name}${version}${path}`)
    }

    return lines.join('\n')
  }
}
