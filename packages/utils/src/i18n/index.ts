/**
 * Internationalization (i18n) Module
 *
 * Provides multi-language support for CLI messages.
 * Supports locale detection, fallback, and interpolation.
 */

export { getLocale, getSupportedLocales, I18n, setLocale, t } from './i18n.js'
export type { Locale, TranslationKey, TranslationParams } from './types.js'
