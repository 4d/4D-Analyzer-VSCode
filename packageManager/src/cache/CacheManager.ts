import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import AdmZip from 'adm-zip';
import { Dependency } from '../dependency/Dependency';
import { DependencyMetadata } from '../types';
import { getDefaultCacheFolder } from '../utils';

const TEMP_DIR_PREFIX = '4d-dep-';
const MAC_RESOURCE_FILE_PREFIX = '._';

/**
 * Cache manager for downloaded dependencies
 * Handles extraction, storage, and retrieval of cached dependencies
 */
export class CacheManager {
  private cacheRoot: string;

  constructor(cacheRoot?: string) {
    if (cacheRoot && !path.isAbsolute(cacheRoot)) {
      throw new Error('Cache root must be an absolute path');
    }
    this.cacheRoot = cacheRoot || this.getDefaultCacheRoot();
  }

  /**
   * Get default cache root based on platform
   */
  private getDefaultCacheRoot(): string {
    return getDefaultCacheFolder();
  }

  /**
   * Get cache folder for a specific dependency
   */
  getDependencyFolder(dependency: Dependency, tag: string): string {
    const dependencyLocation = path.join(this.getCacheRoot(), dependency.getCacheFolderPath(tag));
    return dependencyLocation;
  }

  /**
   * Get metadata file path for a dependency
   */
  getMetadataPath(dependency: Dependency, tag: string): string {
        const dependencyLocation = path.join(this.getCacheRoot(), dependency.getMetadataFilePath(tag));
    return dependencyLocation;
  }

  private async unzip(input: string, inDirectory: string): Promise<void> {
    try {
      const zip = new AdmZip(input);
      zip.extractAllTo(inDirectory, true);
    } catch (error) {
      throw new Error(`Failed to extract archive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Move a folder from source to target, with fallback for cross-device moves.
   * On Windows (especially ARM), fs.rename can fail with EXDEV (cross-device)
   * or EPERM (antivirus/Controlled Folder Access). Falls back to copy + delete.
   */
  private async moveFolder(source: string, target: string): Promise<void> {
    try {
      await fs.rename(source, target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EXDEV' || code === 'EPERM' || code === 'EACCES') {
        // Fallback: copy recursively then remove source
        await fs.cp(source, target, { recursive: true });
        await fs.rm(source, { recursive: true, force: true });
      } else {
        throw error;
      }
    }
  }

  /**
   * Remove target folder if it exists
   */
  private async removeTargetFolder(targetFolder: string): Promise<void> {
    try {
      await fs.rm(targetFolder, { recursive: true });
    } catch (error) {
      // Ignore if folder doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Failed to remove target folder: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Find the .4dbase folder if it exists
   * Searches direct children first, then one level deeper
   * (zip archives from GitHub often contain a top-level wrapper directory)
   */
  private async find4DBaseFolder(tempDir: string): Promise<string | null>  {
    const entries = await fs.readdir(tempDir, { withFileTypes: true });

    // First, check direct children for .4dbase
    for (const entry of entries) {
      if (entry.name.toLowerCase().endsWith('.4dbase')) {
        return path.join(tempDir, entry.name);
      }
    }

    // If not found, check one level deeper (inside wrapper directories)
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(tempDir, entry.name);
        try {
          const subEntries = await fs.readdir(subPath);
          for (const subEntry of subEntries) {
            if (subEntry.toLowerCase().endsWith('.4dbase')) {
              return path.join(subPath, subEntry);
            }
          }
        } catch {
          // Ignore read errors on subdirectories
        }
      }
    }

    return null;
  }

  /**
   * Clean up macOS resource fork files (._* files)
   */
  private async cleanupResourceForks(folderPath: string): Promise<void> {
    try {
      const files = await fs.readdir(folderPath);
      const cleanupPromises = files
        .filter(file => file.startsWith(MAC_RESOURCE_FILE_PREFIX))
        .map(file => fs.rm(path.join(folderPath, file), { force: true }));
      
      await Promise.all(cleanupPromises);
    } catch {
      // Ignore cleanup failures - resource fork files are non-essential
    }
  }

  /**
   * Determine the source folder to extract from temp directory
   */
  private async determineSourceFolder(tempDir: string): Promise<string> {
    // Check for .4dbase folder first
    let currentFolder = tempDir;
    const fourdBaseFolder = await this.find4DBaseFolder(tempDir);
    if (fourdBaseFolder) {
      currentFolder = fourdBaseFolder;
    }

    // Check for Contents folder (macOS bundle structure)
    const contentsFolder = path.join(currentFolder, 'Contents');
    if (fsSync.existsSync(contentsFolder)) {
      // Clean up resource forks in the contents folder
      await this.cleanupResourceForks(contentsFolder);
      return contentsFolder;
    }

    // Use temp directory itself
    return currentFolder;
  }

  /**
   * Extract ZIP archive to cache
   * Handles different 4D package structures:
   * - .4dbase folders
   * - Contents folders (macOS bundles)
   * - Regular archives
   */
  async extractArchive(
    temp_file: string,
    dependency: Dependency,
    tag: string
  ): Promise<string> {
    const targetFolder = this.getDependencyFolder(dependency, tag);
    
    // Remove existing target folder if present
    await this.removeTargetFolder(targetFolder);
    
    // Create temp directory
    const tempDir = path.join(os.tmpdir(), `${TEMP_DIR_PREFIX}${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Extract ZIP to temp directory
      await this.unzip(temp_file, tempDir);
      
      // Determine which folder to use as source
      const sourceFolder = await this.determineSourceFolder(tempDir);
      // Ensure target directory parent exists
      await fs.mkdir(path.dirname(targetFolder), { recursive: true });

      // Move to cache (with fallback for cross-device moves on Windows)
      await this.moveFolder(sourceFolder, targetFolder);

      return targetFolder;
    } catch (error) {
      throw new Error(`Failed to extract archive for ${dependency.name}@${tag}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors
      });
    }
  }

  /**
   * Save metadata for a cached dependency
   */
  async saveMetadata(
    dependency: Dependency,
    tag: string,
    metadata: DependencyMetadata
  ): Promise<void> {
    const metadataPath = this.getMetadataPath(dependency, tag);
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Read metadata for a cached dependency
   */
  async readMetadata(dependency: Dependency, tag: string): Promise<DependencyMetadata | null> {
    const metadataPath = this.getMetadataPath(dependency, tag);

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content) as DependencyMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Delete a cached dependency
   */
  async delete(dependency: Dependency, tag: string) {
    const folder = this.getDependencyFolder(dependency, tag);
    const metadataPath = this.getMetadataPath(dependency, tag);

    await fs.rm(folder, { recursive: true, force: true });
    await fs.rm(metadataPath, { force: true });
  }

  /**
   * Clear entire cache
   */
  async clearAll() {
    await fs.rm(this.cacheRoot, { recursive: true, force: true });
  }





  /**
   * Get cache root path
   */
  getCacheRoot(): string {
    return this.cacheRoot;
  }
}