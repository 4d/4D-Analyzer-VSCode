import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as fsSync from 'fs'
import AdmZip from 'adm-zip';
import { Dependency } from '../dependency/Dependency';
/**
 * Cache manager for downloaded dependencies
 * Handles extraction, storage, and retrieval of cached dependencies
 */
export class CacheManager {
  private cacheRoot: string;

  constructor(cacheRoot?: string) {
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
    console.log("Extract ", input, "to", inDirectory);

    try {
      const zip = new AdmZip(input);
      zip.extractAllTo(inDirectory, true);
    } catch (error) {
      throw new Error(`Failed to extract archive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract ZIP archive to cache
   */

  //If there is a .4dbase extract it
  //If there is a Contents folder, go inside and then extract everyting excepts the "._" folders
  //If there is a .4dz rename it by the name
  //Copy everyting from
  async extractArchive(
    temp_file: string,
    dependency: Dependency,
    tag: string
  ): Promise<string> {
    const targetFolder = this.getDependencyFolder(dependency, tag);
    console.log("Remove ", targetFolder)
    try {
      await fs.rm(targetFolder, { recursive: true })
    }catch(e) {}
    // Create temp directory
    const tempDir = path.join(os.tmpdir(), `4d-dep-${Date.now()}`);
    console.log("extractArchive: tempDir", tempDir)
    await fs.mkdir(tempDir);

    try {
      // Extract ZIP to temp directory
      console.log("Extract ", temp_file, tempDir)

      await this.unzip(temp_file, tempDir);
      let currentFolder = tempDir;
      const fourdBaseFolder = path.join(tempDir, `${dependency.name}.4dbase`);
      if (fsSync.existsSync(fourdBaseFolder)) {
        currentFolder = fourdBaseFolder;
      }
      const contents = path.join(tempDir, "Contents")
      if (fsSync.existsSync(contents)) {
        const files = await fs.readdir(currentFolder);
        for (const file of files) {
          if (file.startsWith("._")) {
            fsSync.rmSync(file);
          }
        }
      }

      // Ensure target directory exists
      await fs.mkdir(path.dirname(targetFolder), { recursive: true });

      // Move to cache
      await fs.rename(currentFolder, targetFolder);

      return targetFolder;
    } catch (e) {
      console.log("extractArchive: Error ", e)
      throw e;
    } finally {
      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true });
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