/**
 * Internationalization (i18n) Implementation
 *
 * Provides multi-language support for CLI messages.
 * Features:
 * - Automatic locale detection from system
 * - Fallback to English for missing translations
 * - String interpolation with {{param}} syntax
 * - Runtime locale switching
 */

import { logger } from '../logger/logger.js'
import { de } from './locales/de.js'
import { en } from './locales/en.js'
import { es } from './locales/es.js'
import { fr } from './locales/fr.js'
import { ja } from './locales/ja.js'
import { ko } from './locales/ko.js'
import { zh } from './locales/zh.js'
import type { Locale, TranslationDictionary, TranslationKey, TranslationParams } from './types.js'

/**
 * Supported locales list
 */
const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'zh', 'ja', 'es', 'de', 'fr', 'ko'] as const

/**
 * Default locale used as fallback
 */
const DEFAULT_LOCALE: Locale = 'en'

/**
 * Translation dictionaries for each locale
 */
const translations: Record<Locale, Partial<TranslationDictionary>> = {
  en,
  zh,
  ja,
  es,
  de,
  fr,
  ko,
}

/**
 * Current active locale
 */
let currentLocale: Locale = DEFAULT_LOCALE

/**
 * I18n class for internationalization
 */
export class I18n {
  /**
   * Detect locale with priority: config > env > system
   * @param configLocale - Locale from .pcurc config file (highest priority)
   */
  static detectLocale(configLocale?: string): Locale {
    // 1. Config file locale (highest priority)
    if (configLocale && I18n.isValidLocale(configLocale)) {
      return configLocale
    }

    // 2. Environment variable (e.g., "zh_CN.UTF-8")
    const langEnv = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || ''
    const langCode = langEnv.split('_')[0]?.toLowerCase()

    if (langCode && I18n.isValidLocale(langCode)) {
      return langCode
    }

    // 3. System Intl API
    try {
      const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale
      const localeCode = systemLocale.split('-')[0]?.toLowerCase()

      if (localeCode && I18n.isValidLocale(localeCode)) {
        return localeCode
      }
    } catch (error) {
      // Intl API not available in this environment, fall back to default locale
      logger.debug('Intl API not available for locale detection, using default', {
        error: error instanceof Error ? error.message : String(error),
        defaultLocale: DEFAULT_LOCALE,
      })
    }

    return DEFAULT_LOCALE
  }

  /**
   * Check if a locale code is valid
   */
  static isValidLocale(locale: string): locale is Locale {
    return SUPPORTED_LOCALES.includes(locale as Locale)
  }

  /**
   * Initialize i18n with config locale, specified locale, or auto-detected
   * @param configLocale - Locale from .pcurc config file (highest priority)
   */
  static init(configLocale?: string): void {
    currentLocale = I18n.detectLocale(configLocale)
  }

  /**
   * Get translation for a key with optional interpolation
   */
  static t(key: TranslationKey, params?: TranslationParams): string {
    // Try current locale first
    let translation = translations[currentLocale]?.[key]

    // Fallback to default locale if not found
    if (!translation && currentLocale !== DEFAULT_LOCALE) {
      translation = translations[DEFAULT_LOCALE]?.[key]
    }

    // If still not found, return the key itself
    if (!translation) {
      return key
    }

    // Interpolate parameters
    if (params) {
      return I18n.interpolate(translation, params)
    }

    return translation
  }

  /**
   * Interpolate parameters into a translation string
   * Uses {{param}} syntax
   */
  private static interpolate(text: string, params: TranslationParams): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = params[key]
      if (value !== undefined) {
        return String(value)
      }
      return match
    })
  }

  /**
   * Set the current locale
   */
  static setLocale(locale: Locale): void {
    if (I18n.isValidLocale(locale)) {
      currentLocale = locale
    }
  }

  /**
   * Get the current locale
   */
  static getLocale(): Locale {
    return currentLocale
  }

  /**
   * Get list of supported locales
   */
  static getSupportedLocales(): readonly Locale[] {
    return SUPPORTED_LOCALES
  }
}

// Export convenience functions
export const t = I18n.t.bind(I18n)
export const setLocale = I18n.setLocale.bind(I18n)
export const getLocale = I18n.getLocale.bind(I18n)
export const getSupportedLocales = I18n.getSupportedLocales.bind(I18n)

// Auto-initialize with detected locale
I18n.init()
