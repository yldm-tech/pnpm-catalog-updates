/**
 * WorkspacePath Value Object
 *
 * Represents a file system path to a pnpm workspace.
 * This is an immutable value object that validates and normalizes workspace paths.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { WorkspaceValidationError } from '@pcu/utils'

export class WorkspacePath {
  private readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  /**
   * Create a WorkspacePath from a string
   */
  public static fromString(pathString: string): WorkspacePath {
    if (!pathString || pathString.trim().length === 0) {
      throw new WorkspaceValidationError('WorkspacePath', ['WorkspacePath cannot be empty'])
    }

    // Normalize the path
    const normalized = path.resolve(pathString.trim())

    return new WorkspacePath(normalized)
  }

  /**
   * Create a WorkspacePath from the current working directory
   */
  public static current(): WorkspacePath {
    return new WorkspacePath(process.cwd())
  }

  /**
   * Create a WorkspacePath from file URL (useful for ES modules)
   */
  public static fromFileURL(fileUrl: string): WorkspacePath {
    const filePath = fileURLToPath(fileUrl)
    const directory = path.dirname(filePath)
    return new WorkspacePath(directory)
  }

  /**
   * Get the absolute path as a string
   */
  public toString(): string {
    return this.value
  }

  /**
   * Get the directory name (last part of the path)
   */
  public getDirectoryName(): string {
    return path.basename(this.value)
  }

  /**
   * Join with another path segment
   * SEC-006: Validates that the result stays within the workspace to prevent path traversal
   */
  public join(...segments: string[]): WorkspacePath {
    const joined = path.resolve(this.value, ...segments)

    // SEC-006: Prevent path traversal attacks
    // Use path.relative() to check if the joined path stays within the workspace
    // This prevents prefix collision attacks (e.g., /tmp/ws vs /tmp/ws2)
    const relativePath = path.relative(this.value, joined)

    // If relative path starts with '..' or is absolute, it's outside the workspace
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new WorkspaceValidationError('WorkspacePath', [
        `Path traversal detected: joining [${segments.join(', ')}] would escape workspace boundary`,
      ])
    }

    return new WorkspacePath(joined)
  }

  /**
   * Join with another path segment with basic safety checks
   * SEC-007: Validates that segments don't contain path traversal patterns
   *
   * @deprecated Prefer using join() for user-controlled input.
   * This method is for internal use with trusted, hardcoded paths only.
   * @internal
   */
  public unsafeJoin(...segments: string[]): WorkspacePath {
    // SEC-007: Basic validation to prevent obvious path traversal attempts
    for (const segment of segments) {
      // Check for path traversal patterns
      if (segment.includes('..') || segment.includes('\0')) {
        throw new WorkspaceValidationError('WorkspacePath', [
          `Unsafe path segment detected: segment contains forbidden pattern`,
        ])
      }
      // Check for absolute paths on Unix or Windows
      if (path.isAbsolute(segment)) {
        throw new WorkspaceValidationError('WorkspacePath', [
          `Unsafe path segment detected: absolute paths not allowed`,
        ])
      }
    }
    const joined = path.join(this.value, ...segments)
    return new WorkspacePath(joined)
  }

  /**
   * Get the parent directory
   */
  public getParent(): WorkspacePath {
    const parent = path.dirname(this.value)
    return new WorkspacePath(parent)
  }

  /**
   * Check if this path is a subdirectory of another path
   */
  public isSubdirectoryOf(other: WorkspacePath): boolean {
    const relativePath = path.relative(other.value, this.value)
    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  }

  /**
   * Get relative path from another WorkspacePath
   */
  public relativeTo(other: WorkspacePath): string {
    return path.relative(other.value, this.value)
  }

  /**
   * Check equality with another WorkspacePath
   */
  public equals(other: WorkspacePath): boolean {
    return path.resolve(this.value) === path.resolve(other.value)
  }

  /**
   * Get the value for serialization
   */
  public getValue(): string {
    return this.value
  }

  /**
   * Convert to JSON representation
   */
  public toJSON(): string {
    return this.value
  }

  /**
   * Create from JSON representation
   */
  public static fromJSON(json: string): WorkspacePath {
    return WorkspacePath.fromString(json)
  }

  /**
   * Check if this path exists (requires async validation in infrastructure layer)
   */
  public async exists(): Promise<boolean> {
    try {
      const fs = await import('node:fs/promises')
      await fs.access(this.value)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get the path to pnpm-workspace.yaml
   */
  public getPnpmWorkspaceConfigPath(): WorkspacePath {
    return this.join('pnpm-workspace.yaml')
  }

  /**
   * Get the path to package.json
   */
  public getPackageJsonPath(): WorkspacePath {
    return this.join('package.json')
  }
}
