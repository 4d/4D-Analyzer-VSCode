import { CacheManager } from '../cache/CacheManager';
import { Range } from '../version/Range';
import {
  DependencySpec,
  LockEntry,
  Environment,
} from '../types';
import { Fetcher } from './Fetcher';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Dependency } from './Dependency';
import { Version } from '../version/Version';

/**
 * GitLab-based dependency implementation.
 *
 * Supports multi-level paths (group/subgroup/project).
 * Supports "highest" version alias (picks highest semver across all releases).
 * Supports private instances via the `host` field.
 */
export class GitLabDependency extends Dependency {
  private gitlab_path: string | undefined;
  private _host: string | undefined;

  constructor(spec: DependencySpec, isPrimary: boolean) {
    // Split gitlab path on the *last* slash to support multi-level namespaces:
    //   "group/project"           → namespace="group",         project="project"
    //   "group/subgroup/project"  → namespace="group/subgroup", project="project"
    let namespace = '';
    let project = '';
    if (spec.gitlab) {
      const lastSlash = spec.gitlab.lastIndexOf('/');
      if (lastSlash > 0) {
        namespace = spec.gitlab.substring(0, lastSlash);
        project = spec.gitlab.substring(lastSlash + 1);
      }
    }

    super(namespace, project, spec.version ?? '', spec.tag ?? '', isPrimary);
    this.gitlab_path = spec.gitlab;
    this._host = spec.host;
  }

  /** The host URL for this dependency (undefined means default gitlab.com) */
  get host(): string | undefined { return this._host; }

  /**
   * Fetch this dependency.
   */
  async fetch(
    ideVersion: Version,
    env: Environment,
    lock: LockEntry,
    fetcher: Fetcher,
    cacheManager: CacheManager,
    update: boolean = false
  ): Promise<boolean> {
    if (!(this.owner && this.repo)) {
      return false;
    }

    const namespace = this.owner;
    const project = this.repo;
    console.log(`Fetching GitLab dependency: ${namespace}/${project}`);

    try {
      // Resolve version (handles "highest", "latest", ranges, tags)
      const tag = await this.resolveGitLabVersion(fetcher, ideVersion);
      if (!tag) {
        this.addError(lock, 'No matching version found');
        return false;
      }

      lock.tag = tag;
      const dependencyLocation = path.join(
        cacheManager.getCacheRoot(),
        this.getCacheFolderPath(tag)
      );
      const cachedProject = await this.getPackage(dependencyLocation);

      // Check if already in cache
      if (cachedProject != null && !update) {
        const dependencyPath = cacheManager.getDependencyFolder(this, tag);
        lock.path = dependencyPath;
        lock.found = true;

        const subDeps = await cachedProject.getListDependencies();
        if (subDeps?.dependencies) {
          lock.dependencies = subDeps.dependencies;
        }
        return false; // Already cached
      }

      // Download archive
      const archiveBuffer = await fetcher.downloadReleaseAsset(
        namespace,
        project,
        tag,
      );

      lock.archiveSize = archiveBuffer.byteLength;
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dep-'));
      const tempFile = path.join(tempDir, 'archive.zip');
      await fs.writeFile(tempFile, Buffer.from(archiveBuffer));

      // Extract to cache
      const dependencyPath = await cacheManager.extractArchive(
        tempFile,
        this,
        tag,
      );

      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

      lock.path = dependencyPath;
      lock.found = true;

      // Build URLs
      const host = this._host || env.gitlab.host || 'https://gitlab.com';
      lock.htmlURL = `${host}/${namespace}/${project}/-/releases/${encodeURIComponent(tag)}`;
      lock.archiveURL = `${host}/${namespace}/${project}/-/archive/${encodeURIComponent(tag)}/${project}-${tag}.zip`;

      // Read sub-dependencies from freshly extracted package
      const extractedProject = await this.getPackage(dependencyPath);
      const subDeps = await extractedProject?.getListDependencies();
      if (subDeps?.dependencies) {
        lock.dependencies = subDeps.dependencies;
      }

      // Save metadata
      await cacheManager.saveMetadata(this, tag, {
        name: this.name,
        gitlab: this.gitlab_path ?? '',
        tag,
        fetchedAt: new Date().toISOString(),
        archiveSize: archiveBuffer.byteLength,
      });

      return true; // Successfully fetched
    } catch (error: any) {
      this.addError(lock, error.message);
      lock.found = false;
      return false;
    }
  }

  /**
   * Resolve version for GitLab dependencies.
   * Extends base behaviour with "highest" and "newest" aliases.
   *
   *  - "highest" → get ALL releases, pick max semver (any range)
   *  - "newest" / "latest" / undefined → get latest release (API order)
   *  - semver range → standard range resolution
   *  - "4d" → IDE-version matching (delegated to base class)
   */
  private async resolveGitLabVersion(
    fetcher: Fetcher,
    ideVersion: Version,
  ): Promise<string | null> {
    // Tag always wins
    if (this.tag) {
      return this.tag;
    }

    const version = this.version;

    // "highest" — max semver across all releases
    if (version === 'highest') {
      return this.resolveHighest(fetcher);
    }

    // "newest" is an alias for latest (same as undefined / "latest")
    if (version === 'newest') {
      const release = await fetcher.getLatestRelease(this.owner, this.repo);
      return release.tag_name;
    }

    // Delegate to base class for "latest", "4d", and semver ranges
    return this.resolveVersion(fetcher, ideVersion);
  }

  /**
   * Resolve "highest" — find the highest semantic version across all releases.
   */
  private async resolveHighest(fetcher: Fetcher): Promise<string | null> {
    const releases = await fetcher.getReleases(this.owner, this.repo);
    const validReleases = releases.filter(r => !r.draft && !r.prerelease);
    if (validReleases.length === 0) {
      return null;
    }

    const tags = validReleases.map(r => r.tag_name.replace('R', '.'));
    const range = new Range('*'); // Any version
    const maxTag = range.maxSatisfying(tags);
    if (!maxTag) {
      return null;
    }

    // Map back to original tag name
    const idx = tags.indexOf(maxTag);
    return idx >= 0 ? validReleases[idx].tag_name : null;
  }

  /**
   * Check if dependency is outdated.
   */
  async checkOutdated(
    fetcher: Fetcher,
    ideVersion: Version,
    lock: LockEntry,
    cacheManager: CacheManager,
  ): Promise<void> {
    if (!lock.tag) {
      return;
    }

    try {
      const versionSpec = this.version || 'highest';

      // For "highest" / "newest" / "latest", use any-range
      const isAnyVersion = ['highest', 'newest', 'latest', ''].includes(versionSpec);
      const range = isAnyVersion
        ? new Range('*')
        : new Range(versionSpec, ideVersion);

      const releases = await fetcher.getReleases(this.owner, this.repo);
      const validReleases = releases.filter(r => !r.draft && !r.prerelease);

      const normalizedTags = validReleases.map(r => r.tag_name.replace('R', '.'));
      const wantedNormalized = range.maxSatisfying(normalizedTags);

      if (wantedNormalized) {
        const idx = normalizedTags.indexOf(wantedNormalized);
        const wanted = idx >= 0 ? validReleases[idx].tag_name : wantedNormalized;

        if (wanted !== lock.tag) {
          lock.wanted = wanted;
          lock.outdated = true;
          lock.current = lock.tag;

          const dependencyLocation = path.join(
            cacheManager.getCacheRoot(),
            this.getCacheFolderPath(wanted),
          );
          const p = await this.getPackage(dependencyLocation);
          lock.wantedInCache = p != null;
        }
      }
    } catch (error: any) {
      this.addError(lock, error.message);
    }
  }

  // ── Cache paths ────────────────────────────────────────────────

  getCacheFolderPath(tag: string): string {
    return `.gitlab/${this.getCachePath(tag)}`;
  }

  getMetadataFilePath(tag: string): string {
    return `.gitlab/${this.getCachePath(tag)}.json`;
  }

  // ── Reconciliation ─────────────────────────────────────────────

  reconcileWithEnv(envSpec: string | DependencySpec): void {
    this.mergeWithEnv(envSpec);
  }

  reconcileWithLock(lockEntry: LockEntry | undefined, update: boolean): void {
    if (!lockEntry || update) {
      return;
    }
    this.restoreFromLock(lockEntry.tag);
  }
}
