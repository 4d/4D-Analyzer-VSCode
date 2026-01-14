import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as fsSync from 'fs'
import AdmZip from 'adm-zip';
import { Dependency } from '../dependency/Dependency';

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
    const platform = os.platform();
    const homeDir = os.homedir();

    switch (platform) {
      case 'darwin': // macOS
        return path.join(homeDir, 'Library', 'Caches', '4D', 'Dependencies');
      case 'win32': // Windows
        return path.join(homeDir, 'AppData', 'Local', '4D', 'Dependencies');
      case 'linux':
        return path.join(homeDir, '.cache', '4d', 'dependencies');
      default:
        return path.join(homeDir, '.4d', 'dependencies');
    }
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
   */
  private find4DBaseFolder(tempDir: string, dependencyName: string): string | null {
    const fourdBaseFolder = path.join(tempDir, `${dependencyName}.4dbase`);
    return fsSync.existsSync(fourdBaseFolder) ? fourdBaseFolder : null;
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
    } catch (error) {
      // Log but don't fail if cleanup fails
      throw new Error(`Failed to cleanup resource forks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Determine the source folder to extract from temp directory
   */
  private async determineSourceFolder(tempDir: string, dependencyName: string): Promise<string> {
    // Check for .4dbase folder first
    const fourdBaseFolder = this.find4DBaseFolder(tempDir, dependencyName);
    if (fourdBaseFolder) {
      return fourdBaseFolder;
    }

    // Check for Contents folder (macOS bundle structure)
    const contentsFolder = path.join(tempDir, 'Contents');
    if (fsSync.existsSync(contentsFolder)) {
      // Clean up resource forks in the contents folder
      await this.cleanupResourceForks(contentsFolder);
      return contentsFolder;
    }

    // Use temp directory itself
    return tempDir;
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
      const sourceFolder = await this.determineSourceFolder(tempDir, dependency.name);

      // Ensure target directory parent exists
      await fs.mkdir(path.dirname(targetFolder), { recursive: true });

      // Move to cache
      await fs.rename(sourceFolder, targetFolder);

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
    metadata: any
  ): Promise<void> {
    const metadataPath = this.getMetadataPath(dependency, tag);
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Read metadata for a cached dependency
   */
  async readMetadata(dependency: Dependency, tag: string): Promise<any | null> {
    const metadataPath = this.getMetadataPath(dependency, tag);

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
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