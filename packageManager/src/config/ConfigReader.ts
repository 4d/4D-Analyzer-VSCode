import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { DependenciesFile, EnvironmentFile, LockFile, UserPreferences, Environment, GitHubConfig, GitLabConfig, GitLabHostConfig, FetchConfig, UpdateConfig } from '../types';
import { getDefaultCacheFolder } from '../utils';

/**
 * Configuration file reader
 * Handles reading and parsing all configuration files
 */
export class ConfigReader {
    private projectPath: string;
    private preferencesFolder?: string;

    constructor(projectPath: string, preferencesFolder?: string) {
        this.projectPath = projectPath;
        this.preferencesFolder = preferencesFolder;
    }

    /**
     * Read dependencies.json from project
     */
    async readDependencies(): Promise<DependenciesFile | null> {
        const depFile = path.join(
            this.projectPath,
            'Project',
            'Sources',
            'dependencies.json'
        );

        try {
            const content = await fs.readFile(depFile, 'utf-8');
            const parsed = JSON.parse(content);
            
            // Validate structure
            if (!parsed.dependencies || typeof parsed.dependencies !== 'object') {
                throw new Error('Invalid dependencies.json: missing or invalid dependencies field');
            }
            
            return parsed;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw new Error(`Failed to read dependencies.json: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Read environment4d.json
     * Searches from project directory upward
     */
    async readEnvironment(): Promise<EnvironmentFile | null> {
        let currentDir = this.projectPath;
        const root = path.parse(currentDir).root;

        while (currentDir !== root) {
            const envFile = path.join(currentDir, 'environment4d.json');

            // Check if file exists first
            try {
                await fs.access(envFile);
            } catch {
                // File doesn't exist, continue searching upward
                currentDir = path.dirname(currentDir);
                continue;
            }

            // File exists, try to read and parse it
            try {
                const content = await fs.readFile(envFile, 'utf-8');
                return JSON.parse(content);
            } catch (error) {
                throw new Error(`Failed to read or parse environment4d.json at ${envFile}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return null;
    }

    /**
     * Read dependencies-lock.json from userPreferences
     */
    async readLock(): Promise<LockFile | null> {
        const lockFile = this.getLockFilePath();

        try {
            const content = await fs.readFile(lockFile, 'utf-8');
            const parsed = JSON.parse(content);
            
            // Validate structure
            if (!parsed.dependencies || typeof parsed.dependencies !== 'object') {
                throw new Error('Invalid lock file: missing or invalid dependencies field');
            }
            
            return parsed;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw new Error(`Failed to read lock file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Write lock file
     */
    async writeLock(lock: LockFile): Promise<void> {
        const lockFile = this.getLockFilePath();
        await fs.mkdir(path.dirname(lockFile), { recursive: true });
        await fs.writeFile(lockFile, JSON.stringify(lock, null, 2));
    }

    /**
     * Read dependencies-pref.json from userPreferences
     */
    async readUserPreferences(): Promise<UserPreferences> {
        const prefFile = this.getUserPreferencesPath('dependencies-pref.json');

        try {
            const content = await fs.readFile(prefFile, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return {};
            }
            throw new Error(`Failed to read user preferences: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Write user preferences
     */
    async writeUserPreferences(prefs: UserPreferences): Promise<void> {
        const prefFile = this.getUserPreferencesPath('dependencies-pref.json');
        await fs.mkdir(path.dirname(prefFile), { recursive: true });
        await fs.writeFile(prefFile, JSON.stringify(prefs, null, 2));
    }

    /**
     * Build Environment object from all configuration sources
     * Returns sensible defaults when environment4d.json is absent
     */
    async buildEnvironment(cacheFolder?: string): Promise<Environment> {
        const envFile = await this.readEnvironment();

        return {
            cacheFolder: cacheFolder || this.getDefaultCacheFolder(),
            github: this.buildGitHubConfig(envFile?.github),
            gitlab: this.buildGitLabConfig(envFile?.gitlab),
            fetch: this.buildFetchConfig(envFile?.fetch),
            update: this.buildUpdateConfig(envFile?.update),
            trace: envFile?.trace || false,
            debug: envFile?.debug || false,
            dependencies: envFile?.dependencies || {},
            devDependencies: envFile?.devDependencies || {}
        };
    }

    /**
     * Build GitHub configuration with defaults
     */
    private buildGitHubConfig(config?: GitHubConfig): GitHubConfig {
        return {
            token: config?.token || process.env.GITHUB_TOKEN,
            htmlURL: config?.htmlURL || 'https://github.com',
            apiURL: config?.apiURL || 'https://api.github.com'
        };
    }

    /**
     * Build GitLab configuration with defaults.
     * Extracts per-host overrides from URL-keyed entries in the raw config
     * (e.g. "https://private.gitlab.com": { "token": "..." }).
     */
    private buildGitLabConfig(config?: GitLabConfig): GitLabConfig {
        // Collect URL-keyed per-host overrides from the raw JSON object
        const hosts: Record<string, GitLabHostConfig> = {};
        if (config) {
            const raw = config as unknown as Record<string, unknown>;
            for (const key of Object.keys(raw)) {
                if (key.startsWith('https://') || key.startsWith('http://')) {
                    const value = raw[key];
                    if (value && typeof value === 'object') {
                        hosts[key.replace(/\/+$/, '')] = { token: (value as GitLabHostConfig).token };
                    }
                }
            }
        }

        return {
            token: config?.token || process.env.GITLAB_TOKEN,
            host: config?.host || 'https://gitlab.com',
            ...(Object.keys(hosts).length > 0 ? { hosts } : {}),
        };
    }

    /**
     * Build Fetch configuration with defaults
     */
    private buildFetchConfig(config?: FetchConfig): FetchConfig {
        return {
            timeout: config?.timeout || 10,
            maxRetryCount: config?.maxRetryCount || 3,
            retryDelay: config?.retryDelay || 3,
            parallel: config?.parallel !== false, // Default true
            parallelCount: config?.parallelCount || 0, // 0 = auto (cores-1)
            maxRecursivePass: config?.maxRecursivePass || 1000
        };
    }

    /**
     * Build Update configuration with defaults
     */
    private buildUpdateConfig(config?: UpdateConfig): UpdateConfig {
        return {
            maxCount: config?.maxCount || 1,
            delays: config?.delays || {}
        };
    }

    /**
     * Get lock file path in userPreferences
     */
    private getLockFilePath(): string {
        return this.getUserPreferencesPath('dependencies-lock.json');
    }

    /**
     * Get user preferences directory path
     */
    private getUserPreferencesPath(filename: string): string {
        if (this.preferencesFolder) {
            return path.join(this.preferencesFolder, filename);
        }

        const username = os.userInfo().username;

        return path.join(
            this.projectPath,
            'userPreferences.' + username,
            filename
        );
    }

    /**
     * Get default cache folder based on platform
     */
    private getDefaultCacheFolder(): string {
        return getDefaultCacheFolder();
    }

    /**
     * Get project path
     */
    getProjectPath(): string {
        return this.projectPath;
    }
}