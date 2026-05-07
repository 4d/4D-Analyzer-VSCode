import { CacheManager } from '../cache/CacheManager';
import { Range } from '../version/Range';
import {
  DependencySpec,
  LockEntry,
  Environment,
} from '../types';
import { Fetcher, FetchError } from './Fetcher';
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
  private original_gitlab_path: string | undefined;
  private _host: string | undefined;
  private hostInferredFromGitlabUrl: boolean;

  private static normalizeSpec(spec: DependencySpec): {
    gitlabPath: string | undefined;
    host: string | undefined;
    hostInferredFromGitlabUrl: boolean;
  } {
    const rawGitlab = spec.gitlab;
    if (!rawGitlab) {
      return {
        gitlabPath: undefined,
        host: spec.host,
        hostInferredFromGitlabUrl: false,
      };
    }

    if (!/^https?:\/\//i.test(rawGitlab)) {
      return {
        gitlabPath: rawGitlab,
        host: spec.host,
        hostInferredFromGitlabUrl: false,
      };
    }

    try {
      const parsedUrl = new URL(rawGitlab);
      return {
        gitlabPath: parsedUrl.pathname.replace(/^\/+|\/+$/g, ''),
        host: spec.host ?? parsedUrl.origin,
        hostInferredFromGitlabUrl: spec.host === undefined,
      };
    } catch {
      return {
        gitlabPath: rawGitlab,
        host: spec.host,
        hostInferredFromGitlabUrl: false,
      };
    }
  }

  constructor(spec: DependencySpec, isPrimary: boolean) {
    const normalizedSpec = GitLabDependency.normalizeSpec(spec);
    const gitlabPath = normalizedSpec.gitlabPath;

    // Split gitlab path on the *last* slash to support multi-level namespaces:
    //   "group/project"           → namespace="group",         project="project"
    //   "group/subgroup/project"  → namespace="group/subgroup", project="project"
    let namespace = '';
    let project = '';
    if (gitlabPath) {
      const lastSlash = gitlabPath.lastIndexOf('/');
      if (lastSlash > 0) {
        namespace = gitlabPath.substring(0, lastSlash);
        project = gitlabPath.substring(lastSlash + 1);
      }
    }

    super(namespace, project, spec.version ?? '', spec.tag ?? '', isPrimary);
    this.gitlab_path = gitlabPath;
    this.original_gitlab_path = spec.gitlab;
    this._host = normalizedSpec.host;
    this.hostInferredFromGitlabUrl = normalizedSpec.hostInferredFromGitlabUrl;
  }

  /** The host URL for this dependency (undefined means default gitlab.com) */
  get host(): string | undefined { return this._host; }

  /** Label for error messages: "GitLab" or "GitLab (host)" */
  private get gitlabLabel(): string {
    return this._host ? `GitLab (${this._host})` : 'GitLab';
  }

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
    if (this.hostInferredFromGitlabUrl && this.original_gitlab_path && this._host && this.gitlab_path) {
      this.logger?.warn(
        `GitLab dependency "${this.original_gitlab_path}" uses a full URL in "gitlab". Interpreting it as host="${this._host}" and path="${this.gitlab_path}".`
      );
    }

    if (!(this.owner && this.repo)) {
      this.addError(
        lock,
        `Invalid GitLab dependency path "${this.original_gitlab_path || this.getSourceSpec() || ''}". Expected "<group>/<project>" or "<group>/<subgroup>/<project>"`
      );
      lock.found = false;
      return false;
    }

    const namespace = this.owner;
    const project = this.repo;
    const repoPath = `${namespace}/${project}`;
    this.logger?.info(`Fetching GitLab dependency: ${repoPath}`);

    // Phase 1: Resolve version
    let tag: string | null;
    try {
      tag = await this.resolveGitLabVersion(fetcher, ideVersion);
    } catch (error: any) {
      this.logger?.error(`${repoPath}: ${error.message}`);
      if (this.version) {
        this.addFetchError(lock, `Unable to find a release for ${repoPath} on ${this.gitlabLabel} satisfying version ${this.version}`, error);
      } else {
        this.addFetchError(lock, `Unable to find a release for ${repoPath} on ${this.gitlabLabel}`, error);
      }
      lock.found = false;
      return false;
    }

    if (!tag) {
      this.logger?.warn(`${repoPath}: no matching version found`);
      if (this.version) {
        this.addError(lock, `Unable to find a release for ${repoPath} on ${this.gitlabLabel} satisfying version ${this.version}`);
      } else {
        this.addError(lock, `Unable to find a release for ${repoPath} on ${this.gitlabLabel}`);
      }
      lock.found = false;
      return false;
    }

    this.logger?.debug(`${repoPath}: resolved to tag ${tag}`);
    lock.tag = tag;
    lock.version = this.getEffectiveLockVersion(ideVersion);
    const dependencyLocation = path.join(
      cacheManager.getCacheRoot(),
      this.getCacheFolderPath(tag)
    );
    const cachedProject = await this.getPackage(dependencyLocation);

    // Check if already in cache
    if (cachedProject != null && !update) {
      this.logger?.debug(`${repoPath}@${tag}: found in cache`);
      const dependencyPath = cacheManager.getDependencyFolder(this, tag);
      lock.path = dependencyPath;
      lock.found = true;

      const subDeps = await cachedProject.getListDependencies();
      if (subDeps?.dependencies) {
        lock.dependencies = subDeps.dependencies;
      }
      return false; // Already cached
    }

    // Phase 2: Download archive
    let archiveBuffer: ArrayBuffer;
    try {
      this.logger?.debug(`${repoPath}@${tag}: downloading archive...`);
      archiveBuffer = await fetcher.downloadReleaseAsset(
        namespace,
        project,
        tag,
      );
    } catch (error: any) {
      this.logger?.error(`${repoPath}: ${error.message}`);
      this.addFetchError(lock, `Unable to download release asset for ${repoPath} tag ${tag} on ${this.gitlabLabel}`, error);
      lock.found = false;
      return false;
    }

    lock.archiveSize = archiveBuffer.byteLength;

    // Phase 3: Write temp file and extract archive
    let dependencyPath: string;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dep-'));
    try {
      const tempFile = path.join(tempDir, 'archive.zip');
      await fs.writeFile(tempFile, Buffer.from(archiveBuffer));

      dependencyPath = await cacheManager.extractArchive(
        tempFile,
        this,
        tag,
      );
    } catch (error: any) {
      this.logger?.error(`${repoPath}: ${error.message}`);
      this.addError(lock, `Cannot unzip downloaded file for ${repoPath} tag ${tag}`);
      this.addFetchError(lock, error.message, error);
      lock.found = false;
      return false;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

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
  }

  /**
   * Add error from a FetchError (with status/url) or plain Error
   */
  private addFetchError(lock: LockEntry, message: string, error: any): void {
    if (error instanceof FetchError) {
      this.addError(lock, message, { status: error.status, url: error.url });
    } else {
      this.addError(lock, message);
    }
    this.addOriginalError(lock, message, error);
  }

  /**
   * Resolve version for GitLab dependencies.
   * Extends base behaviour with "highest" and "newest" aliases.
   *
   *  - "highest" / undefined → get ALL releases, pick max semver
   *  - "newest"              → get most recent release (API order)
   *  - "latest"              → get most recent release (API order)
   *  - semver range          → standard range resolution
   *  - "4d"                  → IDE-version matching (delegated to base class)
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

    // "highest" or no version specified — max semver across all releases
    if (version === 'highest' || !version) {
      return this.resolveHighest(fetcher);
    }

    // "newest" — most recent release (API order)
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

  /**
   * Normalize a host URL to a safe filesystem path segment.
   * Strips the protocol prefix and replaces special characters with underscores.
   * e.g. "https://srv-gitlab.example.com" → "srv-gitlab.example.com"
   */
  private normalizeHostToPath(host: string): string {
    let normalized = host;
    const protocolEnd = normalized.indexOf('://');
    if (protocolEnd >= 0) {
      normalized = normalized.substring(protocolEnd + 3);
    }
    return normalized.replace(/[/:?#[\]@!$&'()*+,;=]/g, '_').replace(/_+$/g, '');
  }

  private get gitlabCachePrefix(): string {
    if (this._host) {
      return `.gitlab/${this.normalizeHostToPath(this._host)}`;
    }
    return '.gitlab';
  }

  getCacheFolderPath(tag: string): string {
    return `${this.gitlabCachePrefix}/${this.getCachePath(tag)}`;
  }

  getMetadataFilePath(tag: string): string {
    return `${this.gitlabCachePrefix}/${this.getCachePath(tag)}.json`;
  }

  getSourceType(): 'gitlab' {
    return 'gitlab';
  }

  getSourceSpec(): string | undefined {
    return this.gitlab_path;
  }

  // ── Reconciliation ─────────────────────────────────────────────

  reconcileWithEnv(envSpec: string | DependencySpec): void {
    this.mergeWithEnv(envSpec);
  }

  reconcileWithLock(lockEntry: LockEntry | undefined, update: boolean, ideVersion?: Version): void {
    if (!lockEntry || update) {
      return;
    }

    // Compare effective version with lock to detect changes
    const effectiveVersion = this.getEffectiveLockVersion(ideVersion);
    const lockedVersion = lockEntry.version || "";
    if (effectiveVersion !== lockedVersion) {
      return;
    }

    this.restoreFromLock(lockEntry.tag);
  }

  /**
   * Compute the effective version string for the lock file.
   * - no version / "highest" → "highest"
   * - "4d" → "4D:<ideVersion>" (or "4d" if ideVersion unavailable)
   * - anything else → as-is
   */
  getEffectiveLockVersion(ideVersion?: Version): string {
    if (!this.version || this.version === 'highest') {
      return 'highest';
    }
    if (this.version.toLowerCase() === '4d') {
      return ideVersion ? this.format4DLockVersion(ideVersion) : '4d';
    }
    return this.version;
  }
}
