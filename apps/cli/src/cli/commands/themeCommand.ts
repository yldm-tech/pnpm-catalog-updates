/**
 * Theme Command
 *
 * CLI command to configure color themes.
 */

import { logger, t } from '@pcu/utils'
import { InteractivePrompts } from '../interactive/interactivePrompts.js'
import { StyledText, ThemeManager } from '../themes/colorTheme.js'

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
      console.log(StyledText.iconInfo(t('command.theme.availableThemes')))
      themes.forEach((theme) => {
        console.log(`  • ${theme}`)
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
        console.error(StyledText.iconError(t('command.theme.invalidTheme', { theme: options.set })))
        console.log(StyledText.muted(`${t('command.theme.availableThemes')} ${themes.join(', ')}`))
        throw new Error(t('command.theme.invalidTheme', { theme: options.set }))
      }

      ThemeManager.setTheme(options.set as keyof typeof ThemeManager.themes)
      console.log(StyledText.iconSuccess(t('command.theme.setTo', { theme: options.set })))

      // Show a preview
      this.showThemePreview()
      return
    }

    if (options.interactive) {
      const interactivePrompts = new InteractivePrompts()
      const config = await interactivePrompts.configurationWizard()

      if (config.theme) {
        const validThemes = ThemeManager.listThemes()
        if (validThemes.includes(config.theme)) {
          ThemeManager.setTheme(config.theme as keyof typeof ThemeManager.themes)
          console.log(
            StyledText.iconSuccess(t('command.theme.configured', { theme: config.theme }))
          )
        }
      }
      return
    }

    // Default: show current theme and list
    const currentTheme = ThemeManager.getTheme()
    console.log(StyledText.iconInfo(t('command.theme.currentSettings')))
    console.log(
      `  ${t('command.theme.themeLabel')} ${currentTheme ? t('command.theme.custom') : t('command.theme.default')}`
    )
    console.log(`\n${t('command.theme.availableThemes')}`)
    ThemeManager.listThemes().forEach((theme) => {
      console.log(`  • ${theme}`)
    })
    console.log(StyledText.muted(`\n${t('command.theme.useHint')}`))
  }

  /**
   * Show a preview of the current theme
   */
  private showThemePreview(): void {
    console.log(`\n${t('command.theme.preview')}`)
    const theme = ThemeManager.getTheme()
    console.log(`  ${theme.success(`✓ ${t('command.theme.previewSuccess')}`)}`)
    console.log(`  ${theme.warning(`⚠ ${t('command.theme.previewWarning')}`)}`)
    console.log(`  ${theme.error(`✗ ${t('command.theme.previewError')}`)}`)
    console.log(`  ${theme.info(`ℹ ${t('command.theme.previewInfo')}`)}`)
    console.log(
      `  ${theme.major(t('command.theme.previewMajor'))} | ${theme.minor(t('command.theme.previewMinor'))} | ${theme.patch(t('command.theme.previewPatch'))}`
    )
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
