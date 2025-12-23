/**
 * Interactive Prompts
 *
 * Provides smart prompts and auto-completion for CLI commands
 */

import { FileSystemService } from '@pcu/core'
import { t } from '@pcu/utils'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { StyledText } from '../themes/colorTheme.js'

export interface AutoCompleteOption {
  name: string
  value: string
  description?: string
}

/**
 * Package choice for selection prompts
 */
interface PackageChoice {
  name: string
  current: string
  latest: string
  type: string
}

/**
 * Configuration wizard result
 */
interface ConfigurationWizardResult {
  theme: string
  interactive: boolean
  backup: boolean
  updateStrategy: string
  timeout: number
}

/**
 * Update impact preview
 */
interface UpdateImpact {
  totalUpdates: number
  riskLevel: string
  affectedCount: number
  securityUpdates: number
}

export class InteractivePrompts {
  private fsService: FileSystemService

  constructor() {
    this.fsService = new FileSystemService()
  }

  /**
   * Interactive package selection with search
   */
  async selectPackages(packages: PackageChoice[]): Promise<string[]> {
    if (packages.length === 0) {
      return []
    }

    const choices = packages.map((pkg) => ({
      name: this.formatPackageChoice(pkg),
      value: pkg.name,
      checked: false,
    }))

    const answers = await inquirer.prompt({
      type: 'checkbox',
      name: 'selectedPackages',
      message: StyledText.iconPackage('Select packages to update:'),
      choices,
      pageSize: 15,
      validate: (input: unknown) => {
        const selected = input as string[]
        return selected.length > 0 || t('prompt.selectAtLeastOne')
      },
    })

    return answers.selectedPackages
  }

  /**
   * Interactive catalog selection
   */
  async selectCatalog(catalogs: string[]): Promise<string | null> {
    if (catalogs.length === 0) {
      return null
    }

    if (catalogs.length === 1) {
      return catalogs[0] ?? null
    }

    const choices = [
      { name: t('prompt.allCatalogs'), value: 'all' },
      ...catalogs.map((name) => ({ name, value: name })),
    ]

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'catalog',
        message: StyledText.iconCatalog('Select catalog to update:'),
        choices,
        pageSize: 10,
      },
    ])

    return answers.catalog === 'all' ? null : answers.catalog
  }

  /**
   * Update strategy selection
   */
  async selectUpdateStrategy(): Promise<string> {
    const strategies = [
      { name: t('prompt.strategyLatest'), value: 'latest' },
      { name: t('prompt.strategyGreatest'), value: 'greatest' },
      { name: t('prompt.strategyMinor'), value: 'minor' },
      { name: t('prompt.strategyPatch'), value: 'patch' },
      { name: t('prompt.strategyNewest'), value: 'newest' },
    ]

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'strategy',
        message: StyledText.iconUpdate('Select update strategy:'),
        choices: strategies,
      },
    ])

    return answers.strategy
  }

  /**
   * Confirm dangerous operations
   */
  async confirmDangerousOperation(operation: string, details?: string): Promise<boolean> {
    console.log('')
    if (details) {
      console.log(chalk.yellow('⚠️  Warning:'), details)
    }

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: StyledText.warning(`Are you sure you want to ${operation}?`),
        default: false,
      },
    ])

    return answers.confirmed
  }

  /**
   * Auto-complete for package names (using list as fallback)
   */
  async autoCompletePackage(
    packages: string[],
    message: string = 'Select package:'
  ): Promise<string> {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'package',
        message,
        choices: packages.map((pkg) => ({ name: pkg, value: pkg })),
        pageSize: 10,
      },
    ])

    return answers.package
  }

  /**
   * Workspace path selection with auto-complete
   */
  async selectWorkspacePath(): Promise<string> {
    const currentDir = process.cwd()
    const choices = [
      { name: t('prompt.currentDirectory', { path: currentDir }), value: currentDir },
      { name: t('prompt.browseDirectory'), value: 'browse' },
    ]

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'path',
        message: StyledText.icon('📁', 'Select workspace directory:'),
        choices,
      },
    ])

    if (answers.path === 'browse') {
      return this.browseDirectory()
    }

    return answers.path
  }

  /**
   * Browse directory structure
   */
  private async browseDirectory(currentPath = process.cwd()): Promise<string> {
    const directoryNames = await this.fsService.listDirectories(currentPath)
    const choices = [
      { name: t('prompt.parentDirectory'), value: '..' },
      { name: t('prompt.currentDirectory', { path: currentPath }), value: '.' },
      ...directoryNames.map((name: string) => ({
        name: `📁 ${name}`,
        value: `${currentPath}/${name}`,
      })),
    ]

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: `Browse: ${currentPath}`,
        choices,
        pageSize: 15,
      },
    ])

    if (answers.selected === '.') {
      return currentPath
    }

    if (answers.selected === '..') {
      const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
      return this.browseDirectory(parent)
    }

    // Check if this directory contains a pnpm workspace
    const workspaceFiles = ['pnpm-workspace.yaml', 'pnpm-workspace.yml']
    let hasWorkspace = false
    for (const file of workspaceFiles) {
      if (await this.fsService.exists(`${answers.selected}/${file}`)) {
        hasWorkspace = true
        break
      }
    }

    if (hasWorkspace) {
      const confirm = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useThis',
          message: t('prompt.useAsWorkspace', { path: answers.selected }),
          default: true,
        },
      ])

      if (confirm.useThis) {
        return answers.selected
      }
    }

    return this.browseDirectory(answers.selected)
  }

  /**
   * Multi-step configuration wizard
   */
  async configurationWizard(): Promise<ConfigurationWizardResult> {
    console.log(chalk.bold.blue(`\n🧙‍♂️ ${t('prompt.configWizard')}\n`))

    const themeAnswer = await inquirer.prompt({
      type: 'list',
      name: 'theme',
      message: t('prompt.selectTheme'),
      choices: [
        { name: t('prompt.themeDefault'), value: 'default' },
        { name: t('prompt.themeModern'), value: 'modern' },
        { name: t('prompt.themeMinimal'), value: 'minimal' },
        { name: t('prompt.themeNeon'), value: 'neon' },
      ],
      default: 'default',
    })

    const interactiveAnswer = await inquirer.prompt({
      type: 'confirm',
      name: 'interactive',
      message: t('prompt.enableInteractive'),
      default: true,
    })

    const backupAnswer = await inquirer.prompt({
      type: 'confirm',
      name: 'backup',
      message: t('prompt.createBackups'),
      default: true,
    })

    const strategyAnswer = await inquirer.prompt({
      type: 'list',
      name: 'updateStrategy',
      message: t('prompt.defaultStrategy'),
      choices: [
        { name: t('prompt.strategyLatestStable'), value: 'latest' },
        { name: t('prompt.strategyMinorUpdates'), value: 'minor' },
        { name: t('prompt.strategyPatchUpdates'), value: 'patch' },
      ],
      default: 'latest',
    })

    const timeoutAnswer = await inquirer.prompt({
      type: 'number',
      name: 'timeout',
      message: t('prompt.networkTimeout'),
      default: 30,
      validate: (input: number | undefined) => {
        if (input === undefined) return t('prompt.timeoutRequired')
        return input > 0 || t('prompt.timeoutPositive')
      },
    })

    const answers: ConfigurationWizardResult = {
      theme: themeAnswer.theme as string,
      interactive: interactiveAnswer.interactive as boolean,
      backup: backupAnswer.backup as boolean,
      updateStrategy: strategyAnswer.updateStrategy as string,
      timeout: timeoutAnswer.timeout as number,
    }

    return answers
  }

  /**
   * Impact preview before update
   */
  async previewImpact(impact: UpdateImpact): Promise<boolean> {
    console.log(chalk.bold.blue(`\n📊 ${t('prompt.impactPreview')}\n`))

    // Display impact summary
    console.log(t('prompt.packagesToUpdate', { count: impact.totalUpdates }))
    console.log(t('prompt.riskLevel', { level: impact.riskLevel }))
    console.log(t('prompt.affectedPackages', { count: impact.affectedCount }))

    if (impact.securityUpdates > 0) {
      console.log(StyledText.iconSecurity(`${impact.securityUpdates} security updates`))
    }

    console.log('')

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: t('prompt.proceedWithUpdate'),
        default: true,
      },
    ])

    return answers.proceed
  }

  /**
   * Error recovery options
   */
  async errorRecoveryOptions(error: string): Promise<string> {
    const options = [
      { name: t('prompt.retryOperation'), value: 'retry' },
      { name: t('prompt.skipPackage'), value: 'skip' },
      { name: t('prompt.continueRemaining'), value: 'continue' },
      { name: t('prompt.abortOperation'), value: 'abort' },
    ]

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: StyledText.iconError(`Error: ${error}`),
        choices: options,
      },
    ])

    return answers.action
  }

  /**
   * Confirm tool update
   */
  async confirmUpdate(message: string): Promise<boolean> {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'update',
        message: StyledText.iconUpdate(message),
        default: true,
      },
    ])

    return answers.update
  }

  /**
   * Format package choice for display
   */
  private formatPackageChoice(pkg: PackageChoice): string {
    const updateTypeColor: Record<string, (text: string) => string> = {
      major: chalk.red,
      minor: chalk.yellow,
      patch: chalk.green,
    }

    const typeColor = updateTypeColor[pkg.type] || chalk.gray

    return `${pkg.name} ${chalk.dim(pkg.current)} → ${typeColor(pkg.latest)} ${chalk.dim(`(${pkg.type})`)}`
  }
}

/**
 * Auto-completion utilities
 */
export class AutoCompleteManager {
  static async suggestWorkspaces(current: string): Promise<string[]> {
    const suggestions: string[] = []

    // Common workspace patterns
    const patterns = [
      'pnpm-workspace.yaml',
      'pnpm-workspace.yml',
      '**/*/pnpm-workspace.yaml',
      '**/*/pnpm-workspace.yml',
    ]

    for (const pattern of patterns) {
      try {
        const { glob } = await import('glob')
        const matches = await glob(pattern)
        matches.forEach((match: string) => {
          const dir = match.replace(/\/pnpm-workspace\.ya?ml$/, '')
          if (!suggestions.includes(dir)) {
            suggestions.push(dir)
          }
        })
      } catch {
        // Ignore errors
      }
    }

    return suggestions.filter((s) => s.toLowerCase().includes(current.toLowerCase()))
  }

  static async suggestCatalogs(): Promise<string[]> {
    return []
  }

  static async suggestPackages(): Promise<string[]> {
    return []
  }
}

/**
 * Command builder options type
 */
interface CommandBuilderOptions {
  format?: string
  interactive?: boolean
  dryRun?: boolean
  backup?: boolean
  prerelease?: boolean
}

/**
 * Interactive command builder
 */
export class InteractiveCommandBuilder {
  static async buildCommand(): Promise<{
    command: string
    options: CommandBuilderOptions
  }> {
    const baseCommand = await inquirer.prompt([
      {
        type: 'list',
        name: 'command',
        message: t('prompt.whatToDo'),
        choices: [
          { name: t('prompt.checkForUpdates'), value: 'check' },
          { name: t('prompt.updateDependencies'), value: 'update' },
          { name: t('prompt.analyzeImpact'), value: 'analyze' },
          { name: t('prompt.showWorkspaceInfo'), value: 'workspace' },
        ],
      },
    ])

    const options: CommandBuilderOptions = {}

    // Common options
    const common = await inquirer.prompt([
      {
        type: 'list',
        name: 'format',
        message: t('prompt.outputFormat'),
        choices: [
          { name: t('prompt.formatTable'), value: 'table' },
          { name: t('prompt.formatJson'), value: 'json' },
          { name: t('prompt.formatYaml'), value: 'yaml' },
          { name: t('prompt.formatMinimal'), value: 'minimal' },
        ],
        default: 'table',
      },
    ])

    options.format = common.format

    // Command-specific options
    switch (baseCommand.command) {
      case 'update': {
        const updateOpts = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'interactive',
            message: t('prompt.interactiveMode'),
            default: true,
          },
          {
            type: 'confirm',
            name: 'dryRun',
            message: t('prompt.dryRunMode'),
            default: false,
          },
          {
            type: 'confirm',
            name: 'backup',
            message: t('prompt.createBackup'),
            default: true,
          },
        ])
        Object.assign(options, updateOpts)
        break
      }

      case 'check': {
        const checkOpts = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'includePrerelease',
            message: t('prompt.includePrerelease'),
            default: false,
          },
        ])
        options.prerelease = checkOpts.includePrerelease
        break
      }
    }

    return {
      command: baseCommand.command,
      options,
    }
  }
}
