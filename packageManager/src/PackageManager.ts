import * as path from 'path';
import { ConfigReader } from './config/ConfigReader';
import { CacheManager } from './cache/CacheManager';
import { GitHubDependency } from './dependency/GithubDependency';
import {
    DependenciesFile,
    LockFile,
    LockEntry,
    DependencySpec,
    Environment,
    FetchOptions,
    FetchResult
} from './types';
import { GithubFetcher } from './dependency/GithubFetcher';
import { Version } from './version/Version';

/**
 * Main package manager orchestrator
 * Coordinates dependency fetching, version resolution, and lock file management
 */
export class PackageManager {
    private configReader: ConfigReader;
    private cacheManager: CacheManager;
    private fetcher: GithubFetcher | null = null;
    private environment: Environment | null = null;
    private dependencies: DependenciesFile | null = null;
    private lock: LockFile | null = null;
    private reconciled: Map<string, GitHubDependency> = new Map();
    private ideVersion: Version;
    private callback?: (message: string) => void;

    constructor(projectPath: string, ideVersion: string, authToken?: string, cacheFolder?: string, callback?: (message: string) => void) {
        // Validate inputs
        if (!projectPath || typeof projectPath !== 'string') {
            throw new Error('Project path is required and must be a string');
        }
        if (!path.isAbsolute(projectPath)) {
            throw new Error('Project path must be an absolute path');
        }

        this.configReader = new ConfigReader(projectPath);
        this.cacheManager = new CacheManager(cacheFolder);
        this.fetcher = new GithubFetcher(authToken);
        this.ideVersion = new Version(ideVersion);
        this.callback = callback;
    }
    /**
     * Read all configuration files and prepare for fetching
     */
    async initialize(): Promise<void> {
        // Read configuration files
        this.dependencies = await this.configReader.readDependencies();
        if (!this.dependencies) {
            throw new Error('Failed to read dependencies.json - file may not exist or is invalid');
        }

        this.environment = await this.configReader.buildEnvironment(
            this.cacheManager.getCacheRoot()
        );
        if (!this.environment) {
            throw new Error('Failed to build environment - environment4d.json may not exist or is invalid');
        }

        this.lock = await this.configReader.readLock();
        if (!this.lock) {
            // Initialize empty lock file if it doesn't exist
            this.lock = {
                version: 2120,
                dependencies: {}
            };
        }

        // Reconcile dependencies
        this.reconcile(false);
    }

    /**
     * Reconcile dependencies from multiple sources
     * Priority: dependencies.json → environment4d.json → lock file
     */
    private reconcile(update: boolean): void {
        if (!this.dependencies || !this.environment || !this.lock) {
            throw new Error('Not initialized');
        }

        this.reconciled.clear();
        // Process primary dependencies from dependencies.json
        for (const [name, spec] of Object.entries(this.dependencies.dependencies)) {
            // Skip local paths (nothing to fetch)
            if (spec.path) {
                continue;
            }
            // Create dependency
            const dep = new GitHubDependency(spec, true);

            // Override with environment if present
            const envSpec = this.environment.dependencies[name];
            if (envSpec) {
                dep.reconcileWithEnv(envSpec);
            }

            // Restore from lock file
            const lockEntry = this.lock.dependencies[name];
            if (lockEntry && !update) {
                dep.reconcileWithLock(lockEntry, update);
            }                

            this.reconciled.set(name, dep);
        }

    }

    /**
     * Fetch dependencies
     */
    async fetch(options: FetchOptions = {}): Promise<FetchResult> {
        if (!this.fetcher || !this.environment || !this.lock) {
            throw new Error('Not initialized. Call initialize() first.');
        }

        const update = options.update || false;
        const filter = options.filter;

        // Determine which dependencies to fetch
        let toFetch = Array.from(this.reconciled.keys());
        if (filter && filter.length > 0) {
            toFetch = toFetch.filter(name => filter.includes(name));
        }
        // Initialize lock entries
        for (const name of toFetch) {
            if (!this.lock.dependencies[name]) {
                this.lock.dependencies[name] = {};
            }

            const dep = this.reconciled.get(name)!;
            const lockEntry = this.lock.dependencies[name];

            // Copy spec to lock
            lockEntry.github = dep.ID;
            lockEntry.version = dep.version;
            lockEntry.isPrimary = dep.isPrimary;
        }

        let fetchedCount = 0;
        let skippedCount = 0;

        // Multi-pass recursive fetching
        const result = await this.fetchRecursively(toFetch, update);
        fetchedCount = result.fetchedCount;
        skippedCount = result.skippedCount;


        // Save lock file
        await this.configReader.writeLock(this.lock);

        return {
            success: fetchedCount > 0 || skippedCount > 0,
            lock: this.lock,
            errors: this.collectErrors(),
            warnings: this.collectWarnings(),
            fetchedCount,
            skippedCount
        };
    }

    /**
     * Fetch dependencies recursively (multi-pass)
     * Fetches dependencies in batches, with all dependencies in each batch fetched concurrently
     */
    private async fetchRecursively(
        names: string[],
        update: boolean
    ): Promise<{ fetchedCount: number; skippedCount: number }> {
        if (!this.fetcher || !this.environment || !this.lock) {
            throw new Error('Not initialized');
        }

        let fetchedCount = 0;
        let skippedCount = 0;
        const processed = new Set<string>();
        let currentBatch = names;
        let pass = 0;
        const maxPasses = this.environment.fetch.maxRecursivePass!;

        while (currentBatch.length > 0 && pass < maxPasses) {
            pass++;

            // Filter out already-processed dependencies
            const toFetchInBatch = currentBatch.filter(name => !processed.has(name));
            toFetchInBatch.forEach(name => processed.add(name));

            // Fetch all dependencies in current batch concurrently
            const fetchPromises = toFetchInBatch.map(async (name) => {
                const dep = this.reconciled.get(name);
                if (!dep) {
                    return { name, fetched: false };
                }

                const lockEntry = this.lock!.dependencies[name];
                this.callback?.(name);
                const fetched = await dep.fetch(
                    this.ideVersion,
                    this.environment!,
                    lockEntry,
                    this.fetcher!,
                    this.cacheManager,
                    update
                );
                return { name, fetched };
            });

            const results = await Promise.all(fetchPromises);

            // Count results
            for (const result of results) {
                if (result.fetched) {
                    fetchedCount++;
                } else {
                    skippedCount++;
                }
            }

            // Collect sub-dependencies for next batch
            const nextBatch: string[] = [];
            for (const name of toFetchInBatch) {
                const lockEntry = this.lock.dependencies[name];
                const subDeps = this.collectSubDependencies(lockEntry, processed);
                nextBatch.push(...subDeps);
            }

            // Detect conflicts after each batch
            this.detectConflicts();

            currentBatch = nextBatch;
        }

        return { fetchedCount, skippedCount };
    }

    /**
     * Collect sub-dependencies from a lock entry and create dependency objects
     */
    private collectSubDependencies(
        lockEntry: LockEntry,
        processed: Set<string>
    ): string[] {
        if (!lockEntry.dependencies || !this.lock) {
            return [];
        }

        const subDeps: string[] = [];

        for (const [subName, subSpec] of Object.entries(lockEntry.dependencies)) {
            // Type guard: ensure subSpec is a DependencySpec
            if (!subSpec || typeof subSpec !== 'object') {
                continue;
            }
            
            const typedSubSpec = subSpec as DependencySpec;
            
            // Validate dependency name
            if (!subName || typeof subName !== 'string') {
                continue;
            }

            // Skip if already processed or is a local path
            if (processed.has(subName) || typedSubSpec.path) {
                continue;
            }

            // Validate sub-spec has required fields
            if (!typedSubSpec.github && !typedSubSpec.path) {
                continue;
            }

            // Create sub-dependency if it doesn't exist
            if (!this.reconciled.has(subName)) {
                const subDep = new GitHubDependency(typedSubSpec, false);
                this.reconciled.set(subName, subDep);

                // Initialize lock entry
                if (!this.lock.dependencies[subName]) {
                    this.lock.dependencies[subName] = {
                        github: typedSubSpec.github,
                        version: typedSubSpec.version,
                        isPrimary: false
                    };
                }

                subDeps.push(subName);
            }
        }

        return subDeps;
    }

    /**
     * Detect conflicts between dependencies
     */
    private detectConflicts(): void {
        if (!this.environment || !this.lock) {
            return;
        }

        const deps = Array.from(this.reconciled.values());

        for (let i = 0; i < deps.length; i++) {
            for (let j = i + 1; j < deps.length; j++) {
                const dep1 = deps[i];
                const dep2 = deps[j];

                if (dep1.ID === dep2.ID) {
                    const lockEntry1 = this.lock.dependencies[dep1.name];
                    const lockEntry2 = this.lock.dependencies[dep2.name];

                    dep1.compare(dep2, lockEntry1);
                    dep2.compare(dep1, lockEntry2);
                }
            }
        }
    }

    /**
     * Check for outdated dependencies
     */
    async checkOutdated(): Promise<LockFile> {
        if (!this.fetcher || !this.environment || !this.lock) {
            throw new Error('Not initialized. Call initialize() first.');
        }

        for (const [name, dep] of this.reconciled.entries()) {
            const lockEntry = this.lock.dependencies[name];
            if (lockEntry) {
                await dep.checkOutdated(
                    this.fetcher,
                    this.ideVersion,
                    lockEntry,
                    this.cacheManager
                );
            }
        }

        await this.configReader.writeLock(this.lock);
        return this.lock;
    }

    /**
     * Collect all errors from lock file
     */
    private collectErrors(): any[] {
        if (!this.lock) {
            return [];
        }

        const errors: any[] = [];
        for (const [name, entry] of Object.entries(this.lock.dependencies)) {
            if (entry.update?.errors) {
                errors.push(...entry.update.errors.map(e => ({ dependency: name, ...e })));
            }
        }
        return errors;
    }

    /**
     * Collect all warnings from lock file
     */
    private collectWarnings(): any[] {
        if (!this.lock) {
            return [];
        }

        const warnings: any[] = [];
        for (const [name, entry] of Object.entries(this.lock.dependencies)) {
            if (entry.update?.warnings) {
                warnings.push(...entry.update.warnings.map(w => ({ dependency: name, ...w })));
            }
        }
        return warnings;
    }

    /**
     * Get lock file
     */
    getLock(): LockFile | null {
        return this.lock;
    }

    /**
     * Get environment
     */
    getEnvironment(): Environment | null {
        return this.environment;
    }

    /**
     * Get cache manager
     */
    getCacheManager(): CacheManager {
        return this.cacheManager;
    }
}