/**
 * Option Utilities
 *
 * Common utilities for merging CLI options with defaults.
 */

/**
 * Option types supported by the merge utility
 */
type OptionType = 'string' | 'boolean' | 'number' | 'array' | 'optional-string'

/**
 * Schema definition for a single option
 */
interface OptionSchema<T = unknown> {
  type: OptionType
  default: T
}

/**
 * Schema for a complete set of options
 */
export type OptionsSchema<T> = {
  [K in keyof T]: OptionSchema<T[K]>
}

/**
 * Merge a single value with its default based on type
 */
function mergeValue<T>(value: unknown, schema: OptionSchema<T>): T {
  switch (schema.type) {
    case 'string':
      return ((value as string) || schema.default) as T

    case 'optional-string':
      return ((value as string) || undefined) as T

    case 'boolean':
      return ((value as boolean | undefined) ?? schema.default) as T

    case 'number':
      return ((value as number | undefined) ?? schema.default) as T

    case 'array':
      return ((value as T) || schema.default) as T

    default:
      return (value ?? schema.default) as T
  }
}

/**
 * Merge existing options with defaults based on schema
 *
 * @param existing - Options provided by user/CLI
 * @param schema - Schema defining types and defaults
 * @returns Merged options with proper types
 */
export function mergeOptions<T extends Record<string, unknown>>(
  existing: Record<string, unknown>,
  schema: OptionsSchema<T>
): T {
  const result = {} as T

  for (const key of Object.keys(schema) as (keyof T)[]) {
    const optionSchema = schema[key]
    const value = existing[key as string]
    result[key] = mergeValue(value, optionSchema)
  }

  return result
}

/**
 * Common option schemas reused across commands
 */
export const commonSchemas = {
  catalog: { type: 'optional-string' as const, default: undefined as string | undefined },
  format: { type: 'string' as const, default: 'table' as string },
  target: { type: 'string' as const, default: 'latest' as string },
  prerelease: { type: 'boolean' as const, default: false as boolean },
  include: { type: 'array' as const, default: [] as string[] },
  exclude: { type: 'array' as const, default: [] as string[] },
  force: { type: 'boolean' as const, default: false as boolean },
  dryRun: { type: 'boolean' as const, default: false as boolean },
  ai: { type: 'boolean' as const, default: false as boolean },
  provider: { type: 'string' as const, default: 'auto' as string },
  analysisType: { type: 'string' as const, default: 'impact' as string },
}
