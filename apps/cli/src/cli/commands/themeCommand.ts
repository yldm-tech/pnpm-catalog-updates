/**
 * Theme Command
 *
 * CLI command to configure color themes.
 */

import { logger, t } from '@pcu/utils'
import { InteractivePrompts } from '../interactive/interactivePrompts.js'
import { StyledText, ThemeManager } from '../themes/colorTheme.js'
import { cliOutput } from '../utils/cliOutput.js'

export interface ThemeCommandOptions {
  set?: string
  list?: boolean
  interactive?: boolean
}

export class ThemeCommand {
  /**
   * Execute the theme command
   */
  async execute(options: ThemeCommandOptions = {}): Promise<void> {
    if (options.list) {
      const themes = ThemeManager.listThemes()
      cliOutput.print(StyledText.iconInfo(t('command.theme.availableThemes')))
      themes.forEach((theme) => {
        cliOutput.print(`  • ${theme}`)
      })
      return
    }

    if (options.set) {
      const themes = ThemeManager.listThemes()
      if (!themes.includes(options.set)) {
        logger.error('Invalid theme specified', undefined, {
          theme: options.set,
          availableThemes: themes,
        })
        cliOutput.error(
          StyledText.iconError(t('command.theme.invalidTheme', { theme: options.set }))
        )
        cliOutput.print(
          StyledText.muted(`${t('command.theme.availableThemes')} ${themes.join(', ')}`)
        )
        throw new Error(t('command.theme.invalidTheme', { theme: options.set }))
      }

      ThemeManager.setTheme(options.set as keyof typeof ThemeManager.themes)
      cliOutput.print(StyledText.iconSuccess(t('command.theme.setTo', { theme: options.set })))

      // Show a preview
      this.showThemePreview()
      return
    }

    if (options.interactive) {
      const interactivePrompts = new InteractivePrompts()
      const selectedTheme = await interactivePrompts.selectTheme()

      if (selectedTheme) {
        ThemeManager.setTheme(selectedTheme as keyof typeof ThemeManager.themes)
        cliOutput.print(StyledText.iconSuccess(t('command.theme.setTo', { theme: selectedTheme })))
        this.showThemePreview()
      } else {
        cliOutput.print(StyledText.muted(t('command.theme.cancelled')))
      }
      return
    }

    // Default: show current theme and list
    const currentTheme = ThemeManager.getTheme()
    cliOutput.print(StyledText.iconInfo(t('command.theme.currentSettings')))
    cliOutput.print(
      `  ${t('command.theme.themeLabel')} ${currentTheme ? t('command.theme.custom') : t('command.theme.default')}`
    )
    cliOutput.print(`\n${t('command.theme.availableThemes')}`)
    ThemeManager.listThemes().forEach((theme) => {
      cliOutput.print(`  • ${theme}`)
    })
    cliOutput.print(StyledText.muted(`\n${t('command.theme.useHint')}`))
  }

  /**
   * Show a preview of the current theme with realistic examples
   */
  private showThemePreview(): void {
    cliOutput.print(`\n${t('command.theme.preview')}`)
    const theme = ThemeManager.getTheme()

    // Package updates section
    cliOutput.print(`\n  ${theme.primary(`📦 ${t('command.theme.previewPackageUpdates')}`)}`)
    cliOutput.print(
      `     ${theme.text('react'.padEnd(14))} ${theme.muted('18.2.0')}  →  ${theme.major('19.0.0')}   ${theme.muted(`(${t('command.theme.previewMajor')})`)}`
    )
    cliOutput.print(
      `     ${theme.text('typescript'.padEnd(14))} ${theme.muted('5.3.0')}  →  ${theme.minor('5.4.0')}    ${theme.muted(`(${t('command.theme.previewMinor')})`)}`
    )
    cliOutput.print(
      `     ${theme.text('lodash'.padEnd(14))} ${theme.muted('4.17.1')} →  ${theme.patch('4.17.2')}  ${theme.muted(`(${t('command.theme.previewPatch')})`)}`
    )
    cliOutput.print(
      `     ${theme.text('next'.padEnd(14))} ${theme.muted('14.2.0')}  →  ${theme.prerelease('15.0.0-rc.1')} ${theme.muted(`(${t('command.theme.previewPrerelease')})`)}`
    )

    // Status messages section
    cliOutput.print(`\n  ${theme.primary(`💬 ${t('command.theme.previewStatusMessages')}`)}`)
    cliOutput.print(`     ${theme.success(`✓ ${t('command.theme.previewUpdateComplete')}`)}`)
    cliOutput.print(`     ${theme.warning(`⚠ ${t('command.theme.previewPotentialIssue')}`)}`)
    cliOutput.print(`     ${theme.error(`✗ ${t('command.theme.previewOperationFailed')}`)}`)
    cliOutput.print(
      `     ${theme.info(`ℹ ${t('command.theme.previewUpdatesFound', { count: 3 })}`)}`
    )

    // Progress bar section
    cliOutput.print(`\n  ${theme.primary(`📊 ${t('command.theme.previewProgressBar')}`)}`)
    const progressFilled = 24
    const progressEmpty = 16
    const progressBar =
      theme.success('█'.repeat(progressFilled)) + theme.muted('░'.repeat(progressEmpty))
    cliOutput.print(
      `     [${progressBar}] ${theme.info('60%')} ${theme.muted(t('command.theme.previewCheckingDeps'))}`
    )
    cliOutput.print('')
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Configure color theme

Usage:
  pcu theme [options]

Options:
  -s, --set <theme>    Set theme: default, modern, minimal, neon
  -l, --list           List available themes
  -i, --interactive    Interactive theme selection

Examples:
  pcu theme                    # Show current theme and available themes
  pcu theme --list             # List available themes
  pcu theme --set modern       # Set theme to modern
  pcu theme --interactive      # Interactive theme configuration
    `
  }
}
