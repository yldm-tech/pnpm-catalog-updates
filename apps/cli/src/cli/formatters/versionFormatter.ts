/**
 * Version Formatter Utilities
 *
 * Provides version parsing and colorization utilities for CLI output.
 * Extracted from OutputFormatter for better maintainability.
 */

import chalk from 'chalk'
import type { ColorUtils } from './colorUtils.js'

export interface VersionParts {
  major: string
  minor: string
  patch: string
  extra: string
  prefix: string
}

export interface ColorizedVersions {
  currentColored: string
  latestColored: string
}

/**
 * Version formatting utilities for CLI output
 */
export class VersionFormatter {
  constructor(
    private readonly colorUtils: ColorUtils,
    private readonly useColor: boolean = true
  ) {}

  /**
   * Parse a version string into its component parts
   */
  parseVersion(version: string): VersionParts {
    // Remove leading ^ or ~ or other prefix characters
    const cleanVersion = version.replace(/^[\^~>=<]+/, '')
    const parts = cleanVersion.split('.')
    return {
      major: parts[0] || '0',
      minor: parts[1] || '0',
      patch: parts[2] || '0',
      extra: parts.slice(3).join('.'),
      prefix: version.substring(0, version.length - cleanVersion.length),
    }
  }

  /**
   * Colorize version differences between current and latest
   */
  colorizeVersionDiff(current: string, latest: string, updateType: string): ColorizedVersions {
    if (!this.useColor) {
      return { currentColored: current, latestColored: latest }
    }

    const currentParts = this.parseVersion(current)
    const latestParts = this.parseVersion(latest)

    // Determine color based on update type for highlighting differences
    const diffColor = this.colorUtils.getUpdateTypeColor(updateType)

    // Check which parts are different
    const majorChanged = currentParts.major !== latestParts.major
    const minorChanged = currentParts.minor !== latestParts.minor
    const patchChanged = currentParts.patch !== latestParts.patch
    const extraChanged = currentParts.extra !== latestParts.extra

    // Build colored version strings
    const currentColored = this.buildColoredVersion(
      currentParts,
      latestParts,
      { majorChanged, minorChanged, patchChanged, extraChanged },
      true
    )

    const latestColored = this.buildColoredVersion(
      latestParts,
      currentParts,
      { majorChanged, minorChanged, patchChanged, extraChanged },
      false,
      diffColor
    )

    return { currentColored, latestColored }
  }

  /**
   * Build a colored version string
   */
  private buildColoredVersion(
    parts: VersionParts,
    compareParts: VersionParts,
    changes: {
      majorChanged: boolean
      minorChanged: boolean
      patchChanged: boolean
      extraChanged: boolean
    },
    isCurrent: boolean,
    diffColor?: typeof chalk
  ): string {
    const colorPart = (part: string, comparePart: string, isChanged: boolean) => {
      if (isCurrent) {
        // For current version: dim white for changed parts
        if (isChanged && part !== comparePart) {
          return chalk.dim.white(part)
        }
        return chalk.white(part)
      } else {
        // For latest version: highlight changed parts with update type color
        if (isChanged && part !== comparePart && diffColor) {
          return diffColor(part)
        }
        return chalk.white(part)
      }
    }

    let result = parts.prefix
    result += colorPart(parts.major, compareParts.major, changes.majorChanged)
    result += '.'
    result += colorPart(parts.minor, compareParts.minor, changes.minorChanged)
    result += '.'
    result += colorPart(parts.patch, compareParts.patch, changes.patchChanged)

    if (parts.extra) {
      result += `.${colorPart(parts.extra, compareParts.extra, changes.extraChanged)}`
    }

    return result
  }
}
