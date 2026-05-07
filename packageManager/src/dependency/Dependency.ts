import { DependencySpec, Environment, Logger, LockEntry, ErrorMessage } from "../types";
import { CacheManager } from "../cache/CacheManager";
import { Fetcher } from "./Fetcher";
import { Range } from "../version/Range";
import { Package } from "./Package";
import { Version } from "../version/Version";

export abstract class Dependency {

    private _name: string = "";
    private _owner: string = "";
    private _version: string | undefined;
    private _tag: string | undefined;
    private _isPrimary: boolean;
    private _logger?: Logger;
    constructor(owner: string, name: string, version: string, tag: string, isPrimary: boolean) {
        this._isPrimary = isPrimary;
        this._version = version;
        this._tag = tag;
        this._owner = owner;
        this._name = name;
    }

    // Getters for component parts
    get name(): string { return this._name; }
    get owner(): string { return this._owner; }
    get repo(): string { return this._name; }
    get tag(): string | undefined { return this._tag; }
    get version(): string | undefined { return this._version; }
    get isPrimary(): boolean { return this._isPrimary; }
    protected get logger(): Logger | undefined { return this._logger; }
    set log(logger: Logger | undefined) { this._logger = logger; }
    // Getters for spec properties
    get ID(): string | undefined {
        return this._owner && this._name ? `${this._owner}/${this._name}` : undefined;
    }


    /**
     * Compare with another dependency for conflicts
     */
    compare(
        other: Dependency,
        lock: LockEntry,
    ): void {
        const conflict = this.compareWith(other);

        if (!conflict) {
            return;
        }

        // Handle tag vs range conflicts - need to check with Range class
        if (conflict.tagToCheck && conflict.rangeToCheck) {
            const range = new Range(conflict.rangeToCheck);
            if (!range.satisfiedBy(conflict.tagToCheck)) {
                this.handleConflict(lock, conflict.message, conflict.tags, conflict.versions);
            }
            return;
        }

        // Handle both version ranges - need to check intersection
        if (conflict.range1 && conflict.range2) {
            const range1 = new Range(conflict.range1);
            const range2 = new Range(conflict.range2);

            if (!range1.intersects(range2)) {
                this.handleConflict(lock, conflict.message, undefined, conflict.versions);
            }
            return;
        }

        // Handle direct conflicts (tags don't match)
        this.handleConflict(lock, conflict.message, conflict.tags, conflict.versions);
    }

    /**
     * Handle conflict detection
     */
    private handleConflict(
        lock: LockEntry,
        message: string,
        tags?: string[],
        versions?: string[]
    ): void {
        if (this._isPrimary) {
            // Primary dependency: warning only
            this.addWarning(lock, message);
        } else {
            // Secondary dependency: error and mark as conflict
            this.addError(lock, message);
            lock.conflict = true;
            lock.path = undefined; // Clear cache path
        }

        if (tags) {
            lock.tags = tags;
        }
        if (versions) {
            lock.versions = versions;
        }
    }



    /**
     * Add error to lock entry
     */
    protected addError(lock: LockEntry, message: string, extra?: Partial<ErrorMessage>): void {
        if (!lock.errors) {
            lock.errors = [];
        }
        const error: ErrorMessage = { message, ...extra };
        lock.errors.push(error);
    }

    /**
     * Add warning to lock entry
     */
    protected addWarning(lock: LockEntry, message: string): void {
        if (!lock.warnings) {
            lock.warnings = [];
        }
        lock.warnings.push({ message });
    }

    /**
     * Extract a concise nested error cause for persistence in lock entries.
     */
    protected getErrorCause(error: unknown): string | undefined {
        if (!(error instanceof Error)) {
            return undefined;
        }

        const cause = (error as Error & { cause?: unknown }).cause;
        const nestedCause = cause instanceof Error
            ? cause.message
            : typeof cause === 'string'
                ? cause
                : undefined;

        if (nestedCause && nestedCause !== error.message) {
            return `${error.message}: ${nestedCause}`;
        }

        return error.message || undefined;
    }

    /**
     * Persist the underlying error as a second lock entry when it adds detail.
     */
    protected addOriginalError(lock: LockEntry, summaryMessage: string, error: unknown): void {
        const originalMessage = this.getErrorCause(error);
        if (!originalMessage || originalMessage === summaryMessage) {
            return;
        }
        this.addError(lock, originalMessage);
    }

    /**
     * Resolve version/tag to download
     */
    protected async resolveVersion(
        fetcher: Fetcher,
        ideVersion: Version
    ): Promise<string | null> {

        const owner = this._owner;
        const repo = this.name;
        // If specific tag is specified, use it
        if (this._tag) {
            return this._tag;
        }
        // If no version specified or "latest"
        if (!this._version || this._version === 'latest') {
            const release = await fetcher.getLatestRelease(owner, repo);
            return release.tag_name;
        }

        // If "4d" keyword, match IDE version
        if (this._version.toLowerCase() === '4d') {

            //main means latest
            if (ideVersion.isMain) {
                const release = await fetcher.getLatestRelease(owner, repo);
                return release.tag_name;
            }
            else {
                const range = new Range(this._version, ideVersion);
                return await this.resolveRange(fetcher, owner, repo, range);
            }
        }

        // Parse as version range
        const range = new Range(this._version);
        return await this.resolveRange(fetcher, owner, repo, range);
    }


    /**
     * Resolve a version range to a specific tag
     */
    private async resolveRange(
        fetcher: Fetcher,
        owner: string,
        repo: string,
        range: Range
    ): Promise<string | null> {
        // Get all releases
        const releases = await fetcher.getReleases(owner, repo);

        // Filter out drafts and prereleases (unless specifically requested)
        const validReleases = releases.filter(r => !r.draft && !r.prerelease);

        // Extract tags
        const tags = validReleases.map(r => r.tag_name.replace("R", "."));
        // Find max satisfying version
        const tagFound = range.maxSatisfying(tags);
        if (!tagFound) {
            return null;
        }

        //Find matching tag name
        let index = 0;
        for (const tag of tags) {
            if (tag === tagFound) {
                return validReleases[index].tag_name;
            }
            index++;
        }
        return null;
    }

    /**
     * Merge with environment spec
     * Handles both string (local path) and DependencySpec overrides
     */
    mergeWithEnv(envSpec: string | DependencySpec): void {
        if (typeof envSpec === 'string') {
            // Local path override
            this._owner = "";
            this._name = "";
        } else {
            // Merge specs (environment overrides)
            if (envSpec.github !== undefined) {
                if (envSpec.github) {
                    const [owner, repo] = envSpec.github.split("/");
                    this._owner = owner;
                    this._name = repo;
                } else {
                    this._owner = "";
                    this._name = "";
                }
            }
            if (envSpec.version !== undefined) this._version = envSpec.version;
            if (envSpec.tag !== undefined) this._tag = envSpec.tag;
        }
    }

    /**
     * Restore state from lock entry
     */
    restoreFromLock(lockTag: string | undefined): void {
        if (lockTag && !this._tag) {
            this._tag = lockTag;
        }
    }

    /**
     * Get the cache path components for this dependency
     * Returns path like: owner/repo/encodedTag
     */
    getCachePath(tag: string): string {
        const encodedTag = this.encodeTag(tag);
        return `${this._owner}/${this._name}/${encodedTag}`;
    }

    /**
     * Compare with another dependency for conflicts
     * Returns conflict information if incompatible, null otherwise
     */
    compareWith(other: Dependency): DependencyConflict | null {
        // Must be same GitHub repository
        const thisGithub = this.ID;
        const otherGithub = other.ID;

        if (!thisGithub || !otherGithub || thisGithub !== otherGithub) {
            return null;
        }

        // Both have exact tags
        if (this._tag && other._tag) {
            if (this._tag !== other._tag) {
                return {
                    message: `Conflicting tags: ${this._tag} vs ${other._tag}`,
                    tags: [this._tag, other._tag]
                };
            }
            return null;
        }

        // Tag vs version range
        if (this._tag && other._version) {
            return {
                message: `Tag ${this._tag} vs range ${other._version}`,
                tags: [this._tag],
                versions: [other._version],
                tagToCheck: this._tag,
                rangeToCheck: other._version
            };
        }

        if (other._tag && this._version) {
            return {
                message: `Tag ${other._tag} vs range ${this._version}`,
                tags: [other._tag],
                versions: [this._version],
                tagToCheck: other._tag,
                rangeToCheck: this._version
            };
        }

        // Both version ranges
        if (this._version && other._version) {
            return {
                message: `Range comparison: ${this._version} vs ${other._version}`,
                versions: [this._version, other._version],
                range1: this._version,
                range2: other._version
            };
        }

        return null;
    }

    /**
     * Format the IDE version for the lock file when version="4d".
     * LTS → "4D:20", "4D:21"
     * R-release → "4D:21R2", "4D:20R10"
     */
    protected format4DLockVersion(ideVersion: Version): string {
        if (ideVersion.isR) {
            return `4D:${ideVersion.major}R${ideVersion.minor}`;
        }
        return `4D:${ideVersion.major}`;
    }

    /**
     * Encode tag for filesystem (replace / with _)
     */
    private encodeTag(tag: string): string {
        return tag.replace(/\//g, '_');
    }

    /**
     * Get the relative cache folder path
     */
    abstract getCacheFolderPath(tag: string): string;

    /**
     * Get the relative metadata file path
     */
    abstract getMetadataFilePath(tag: string): string;

    abstract getSourceType(): 'github' | 'gitlab';

    abstract getSourceSpec(): string | undefined;

    abstract fetch(
        ideVersion: Version,
        env: Environment,
        lock: LockEntry,
        fetcher: Fetcher,
        cacheManager: CacheManager,
        update?: boolean
    ): Promise<boolean>;

    abstract reconcileWithEnv(envSpec: string | DependencySpec): void;

    abstract reconcileWithLock(lockEntry: LockEntry | undefined, update: boolean, ideVersion?: Version): void;

    /**
     * Compute the effective version string to persist in the lock file.
     * Subclasses override to map empty/alias versions to canonical keywords
     * (e.g. "latest", "highest") and expand "4d" to "4D:<ideVersion>".
     */
    abstract getEffectiveLockVersion(ideVersion?: Version): string;

    abstract checkOutdated(
        fetcher: Fetcher,
        ideVersion: Version,
        lock: LockEntry,
        cacheManager: CacheManager
    ): Promise<void>;

    async getPackage(root: string): Promise<Package | null> {
        return Package.Create(root)
    }

}

export interface DependencyConflict {
    message: string;
    tags?: string[];
    versions?: string[];
    tagToCheck?: string;
    rangeToCheck?: string;
    range1?: string;
    range2?: string;
}