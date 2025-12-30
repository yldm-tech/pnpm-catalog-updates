/**
 * String Utilities
 */

// PERF-001: Pre-compiled regex pattern for stripping ANSI escape codes
// Moved to module level to avoid creating new RegExp on each call
const ANSI_ESCAPE = String.fromCharCode(27)
const ANSI_STRIP_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[[0-9;]*m`, 'g')

/**
 * Convert camelCase to kebab-case
 */
export function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Convert kebab-case to camelCase
 */
export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number, ellipsis: string = '...'): string {
  if (str.length <= maxLength) {
    return str
  }
  return str.slice(0, maxLength - ellipsis.length) + ellipsis
}

/**
 * Pad string to specified length
 */
export function pad(
  str: string,
  length: number,
  char: string = ' ',
  direction: 'left' | 'right' | 'both' = 'right'
): string {
  const padding = Math.max(0, length - str.length)

  switch (direction) {
    case 'left':
      return char.repeat(padding) + str
    case 'both': {
      const leftPad = Math.floor(padding / 2)
      const rightPad = padding - leftPad
      return char.repeat(leftPad) + str + char.repeat(rightPad)
    }
    default:
      return str + char.repeat(padding)
  }
}

/**
 * Remove ANSI color codes from string
 * PERF-001: Uses pre-compiled regex pattern for better performance
 */
export function stripAnsi(str: string): string {
  return str.replace(ANSI_STRIP_PATTERN, '')
}

/**
 * Pluralize word based on count
 */
export function pluralize(word: string, count: number, suffix: string = 's'): string {
  return count === 1 ? word : word + suffix
}

/**
 * Generate random string
 */
export function randomString(
  length: number,
  chars: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Escape string for use in regex
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Convert string to slug (URL-friendly)
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

/**
 * Parse boolean from string (handles various formats)
 */
export function parseBoolean(value: string | boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  const normalized = value.toLowerCase().trim()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

/**
 * Parse boolean flag from CLI input (handles unknown types from Commander.js)
 * More robust version that handles null, undefined, numbers, and various string formats.
 * Unknown non-empty strings are treated as truthy (for Commander env() compatibility).
 */
export function parseBooleanFlag(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '') return false
    if (['false', '0', 'no', 'off', 'n'].includes(normalized)) return false
    if (['true', '1', 'yes', 'on', 'y'].includes(normalized)) return true
    // Commander env() passes arbitrary non-empty strings; treat unknown strings as enabled
    return true
  }
  return Boolean(value)
}

/**
 * Format template string with variables
 */
export function template(
  str: string,
  variables: Record<string, string | number | boolean | undefined>
): string {
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match
  })
}

/**
 * Calculate string similarity (Levenshtein distance)
 * QUAL-003: Eliminated non-null assertions by using safe array access helper
 */
export function similarity(a: string, b: string): number {
  const rows = b.length + 1
  const cols = a.length + 1

  // Initialize matrix with proper dimensions
  const matrix: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))

  // Safe getter that returns 0 as fallback (should never happen with proper initialization)
  const getCell = (row: number, col: number): number => matrix[row]?.[col] ?? 0
  const setCell = (row: number, col: number, value: number): void => {
    const rowArr = matrix[row]
    if (rowArr) {
      rowArr[col] = value
    }
  }

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    setCell(i, 0, i)
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    setCell(0, j, j)
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        setCell(i, j, getCell(i - 1, j - 1))
      } else {
        setCell(
          i,
          j,
          Math.min(
            getCell(i - 1, j - 1) + 1, // substitution
            getCell(i, j - 1) + 1, // insertion
            getCell(i - 1, j) + 1 // deletion
          )
        )
      }
    }
  }

  const maxLength = Math.max(a.length, b.length)
  return maxLength === 0 ? 1 : (maxLength - getCell(b.length, a.length)) / maxLength
}
