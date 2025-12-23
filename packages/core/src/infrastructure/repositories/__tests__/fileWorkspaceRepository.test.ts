/**
 * FileWorkspaceRepository Tests
 */

import { FileSystemError } from '@pcu/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Workspace } from '../../../domain/entities/workspace.js'
import { CatalogCollection } from '../../../domain/value-objects/catalogCollection.js'
import { PackageCollection } from '../../../domain/value-objects/packageCollection.js'
import { WorkspaceConfig } from '../../../domain/value-objects/workspaceConfig.js'
import { WorkspaceId } from '../../../domain/value-objects/workspaceId.js'
import { WorkspacePath } from '../../../domain/value-objects/workspacePath.js'
import type { FileSystemService } from '../../file-system/fileSystemService.js'
import { FileWorkspaceRepository } from '../fileWorkspaceRepository.js'

describe('FileWorkspaceRepository', () => {
  let repository: FileWorkspaceRepository
  let mockFileSystemService: FileSystemService

  const mockWorkspacePath = WorkspacePath.fromString('/test/workspace')
  const mockWorkspaceData = {
    packages: ['packages/*'],
    catalog: {
      lodash: '^4.17.21',
      react: '^18.2.0',
    },
  }

  const mockPackageJsonData = {
    name: 'test-package',
    version: '1.0.0',
    dependencies: {
      lodash: 'catalog:',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockFileSystemService = {
      isPnpmWorkspace: vi.fn().mockResolvedValue(true),
      readPnpmWorkspaceConfig: vi.fn().mockResolvedValue(mockWorkspaceData),
      writePnpmWorkspaceConfig: vi.fn().mockResolvedValue(undefined),
      findPackageJsonFiles: vi
        .fn()
        .mockResolvedValue(['/test/workspace/packages/pkg-a/package.json']),
      readPackageJson: vi.fn().mockResolvedValue(mockPackageJsonData),
      writePackageJson: vi.fn().mockResolvedValue(undefined),
      findNearestWorkspace: vi.fn().mockResolvedValue('/test/workspace'),
    } as unknown as FileSystemService

    repository = new FileWorkspaceRepository(mockFileSystemService)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('findByPath', () => {
    it('should return workspace when path is valid', async () => {
      const result = await repository.findByPath(mockWorkspacePath)

      expect(result).not.toBeNull()
      expect(result).toBeInstanceOf(Workspace)
      expect(mockFileSystemService.isPnpmWorkspace).toHaveBeenCalledWith(
        mockWorkspacePath.toString()
      )
      expect(mockFileSystemService.readPnpmWorkspaceConfig).toHaveBeenCalledWith(mockWorkspacePath)
    })

    it('should return null when path is not a valid workspace', async () => {
      vi.mocked(mockFileSystemService.isPnpmWorkspace).mockResolvedValue(false)

      const result = await repository.findByPath(mockWorkspacePath)

      expect(result).toBeNull()
      expect(mockFileSystemService.isPnpmWorkspace).toHaveBeenCalledWith(
        mockWorkspacePath.toString()
      )
      expect(mockFileSystemService.readPnpmWorkspaceConfig).not.toHaveBeenCalled()
    })

    it('should return null when error occurs', async () => {
      vi.mocked(mockFileSystemService.readPnpmWorkspaceConfig).mockRejectedValue(
        new Error('Read error')
      )

      const result = await repository.findByPath(mockWorkspacePath)

      expect(result).toBeNull()
    })

    it('should load packages from workspace', async () => {
      const result = await repository.findByPath(mockWorkspacePath)

      expect(result).not.toBeNull()
      expect(mockFileSystemService.findPackageJsonFiles).toHaveBeenCalled()
      expect(mockFileSystemService.readPackageJson).toHaveBeenCalled()
    })
  })

  describe('findById', () => {
    it('should throw FileSystemError as not implemented', async () => {
      const workspaceId = WorkspaceId.fromPath('/test/workspace')

      await expect(repository.findById(workspaceId)).rejects.toThrow(FileSystemError)
      await expect(repository.findById(workspaceId)).rejects.toThrow('not implemented')
    })
  })

  describe('save', () => {
    it('should save workspace configuration and packages', async () => {
      // Create a minimal workspace for testing
      const workspaceId = WorkspaceId.fromPath('/test/workspace')
      const config = WorkspaceConfig.fromWorkspaceData(mockWorkspaceData)
      const catalogs = CatalogCollection.fromCatalogs([])
      const packages = PackageCollection.fromPackages([])
      const workspace = Workspace.create(workspaceId, mockWorkspacePath, config, catalogs, packages)

      await repository.save(workspace)

      expect(mockFileSystemService.writePnpmWorkspaceConfig).toHaveBeenCalled()
    })

    it('should throw FileSystemError when save fails', async () => {
      vi.mocked(mockFileSystemService.writePnpmWorkspaceConfig).mockRejectedValue(
        new Error('Write error')
      )

      const workspaceId = WorkspaceId.fromPath('/test/workspace')
      const config = WorkspaceConfig.fromWorkspaceData(mockWorkspaceData)
      const catalogs = CatalogCollection.fromCatalogs([])
      const packages = PackageCollection.fromPackages([])
      const workspace = Workspace.create(workspaceId, mockWorkspacePath, config, catalogs, packages)

      await expect(repository.save(workspace)).rejects.toThrow(FileSystemError)
    })
  })

  describe('loadConfiguration', () => {
    it('should load and return workspace configuration', async () => {
      const result = await repository.loadConfiguration(mockWorkspacePath)

      expect(result).toBeInstanceOf(WorkspaceConfig)
      expect(mockFileSystemService.readPnpmWorkspaceConfig).toHaveBeenCalledWith(mockWorkspacePath)
    })

    it('should throw FileSystemError when load fails', async () => {
      vi.mocked(mockFileSystemService.readPnpmWorkspaceConfig).mockRejectedValue(
        new Error('Read error')
      )

      await expect(repository.loadConfiguration(mockWorkspacePath)).rejects.toThrow(FileSystemError)
    })
  })

  describe('saveConfiguration', () => {
    it('should save workspace configuration', async () => {
      const config = WorkspaceConfig.fromWorkspaceData(mockWorkspaceData)

      await repository.saveConfiguration(mockWorkspacePath, config)

      expect(mockFileSystemService.writePnpmWorkspaceConfig).toHaveBeenCalled()
    })

    it('should throw FileSystemError when save fails', async () => {
      vi.mocked(mockFileSystemService.writePnpmWorkspaceConfig).mockRejectedValue(
        new Error('Write error')
      )

      const config = WorkspaceConfig.fromWorkspaceData(mockWorkspaceData)

      await expect(repository.saveConfiguration(mockWorkspacePath, config)).rejects.toThrow(
        FileSystemError
      )
    })
  })

  describe('isValidWorkspace', () => {
    it('should return true for valid workspace', async () => {
      vi.mocked(mockFileSystemService.isPnpmWorkspace).mockResolvedValue(true)

      const result = await repository.isValidWorkspace(mockWorkspacePath)

      expect(result).toBe(true)
      expect(mockFileSystemService.isPnpmWorkspace).toHaveBeenCalledWith(
        mockWorkspacePath.toString()
      )
    })

    it('should return false for invalid workspace', async () => {
      vi.mocked(mockFileSystemService.isPnpmWorkspace).mockResolvedValue(false)

      const result = await repository.isValidWorkspace(mockWorkspacePath)

      expect(result).toBe(false)
    })
  })

  describe('discoverWorkspace', () => {
    it('should discover workspace from given path', async () => {
      const result = await repository.discoverWorkspace(mockWorkspacePath)

      expect(result).not.toBeNull()
      expect(mockFileSystemService.findNearestWorkspace).toHaveBeenCalledWith(
        mockWorkspacePath.toString()
      )
    })

    it('should discover workspace from current working directory when no path provided', async () => {
      const result = await repository.discoverWorkspace()

      expect(mockFileSystemService.findNearestWorkspace).toHaveBeenCalledWith(process.cwd())
    })

    it('should return null when no workspace found', async () => {
      vi.mocked(mockFileSystemService.findNearestWorkspace).mockResolvedValue(null)

      const result = await repository.discoverWorkspace(mockWorkspacePath)

      expect(result).toBeNull()
    })

    it('should return null when error occurs during discovery', async () => {
      vi.mocked(mockFileSystemService.findNearestWorkspace).mockRejectedValue(
        new Error('Discovery error')
      )

      const result = await repository.discoverWorkspace(mockWorkspacePath)

      expect(result).toBeNull()
    })
  })

  describe('integration scenarios', () => {
    it('should correctly parse catalogs from workspace data', async () => {
      const workspaceDataWithCatalogs = {
        packages: ['packages/*'],
        catalogs: {
          default: {
            lodash: '^4.17.21',
          },
          react17: {
            react: '^17.0.2',
          },
        },
      }

      vi.mocked(mockFileSystemService.readPnpmWorkspaceConfig).mockResolvedValue(
        workspaceDataWithCatalogs
      )

      const result = await repository.findByPath(mockWorkspacePath)

      expect(result).not.toBeNull()
      expect(result!.getCatalogs().size()).toBe(2)
    })

    it('should handle workspace with no packages', async () => {
      vi.mocked(mockFileSystemService.findPackageJsonFiles).mockResolvedValue([])

      const result = await repository.findByPath(mockWorkspacePath)

      expect(result).not.toBeNull()
      expect(result!.getPackages().size()).toBe(0)
    })

    it('should continue loading other packages when one fails', async () => {
      vi.mocked(mockFileSystemService.findPackageJsonFiles).mockResolvedValue([
        '/test/workspace/packages/pkg-a/package.json',
        '/test/workspace/packages/pkg-b/package.json',
      ])

      vi.mocked(mockFileSystemService.readPackageJson)
        .mockResolvedValueOnce(mockPackageJsonData)
        .mockRejectedValueOnce(new Error('Read error'))

      const result = await repository.findByPath(mockWorkspacePath)

      expect(result).not.toBeNull()
      expect(result!.getPackages().size()).toBe(1)
    })
  })
})
