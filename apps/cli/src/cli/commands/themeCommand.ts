/**
 * Theme Command
 *
 * CLI command to configure color themes.
 */

import { logger } from '@pcu/utils'
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
      console.log(StyledText.iconInfo('Available themes:'))
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
        console.error(StyledText.iconError(`Invalid theme: ${options.set}`))
        console.log(StyledText.muted(`Available themes: ${themes.join(', ')}`))
        throw new Error(`Invalid theme: ${options.set}`)
      }

      ThemeManager.setTheme(options.set as keyof typeof ThemeManager.themes)
      console.log(StyledText.iconSuccess(`Theme set to: ${options.set}`))

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
          console.log(StyledText.iconSuccess(`Theme configured: ${config.theme}`))
        }
      }
      return
    }

    // Default: show current theme and list
    const currentTheme = ThemeManager.getTheme()
    console.log(StyledText.iconInfo('Current theme settings:'))
    console.log(`  Theme: ${currentTheme ? 'custom' : 'default'}`)
    console.log('\nAvailable themes:')
    ThemeManager.listThemes().forEach((theme) => {
      console.log(`  • ${theme}`)
    })
    console.log(
      StyledText.muted('\nUse --set <theme> to change theme or --interactive for guided setup')
    )
  }

  /**
   * Show a preview of the current theme
   */
  private showThemePreview(): void {
    console.log('\nTheme preview:')
    const theme = ThemeManager.getTheme()
    console.log(`  ${theme.success('✓ Success message')}`)
    console.log(`  ${theme.warning('⚠ Warning message')}`)
    console.log(`  ${theme.error('✗ Error message')}`)
    console.log(`  ${theme.info('ℹ Info message')}`)
    console.log(
      `  ${theme.major('Major update')} | ${theme.minor('Minor update')} | ${theme.patch('Patch update')}`
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
