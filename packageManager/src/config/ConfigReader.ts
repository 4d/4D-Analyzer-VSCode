import * as path from 'path';
import * as fs from 'fs/promises'
import * as os from 'os';
import { DependenciesFile, EnvironmentFile, LockFile, UserPreferences, Environment, GitHubConfig, FetchConfig, UpdateConfig } from '../types';
/**
 * Configuration file reader
 * Handles reading and parsing all configuration files
 */
export class ConfigReader {
    private projectPath: string;

    constructor(projectPath: string) {
        this.projectPath = projectPath;
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
            return JSON.parse(content);
        } catch {
            return null;
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

            try {
                const content = await fs.readFile(envFile, 'utf-8');
                return JSON.parse(content);
            } catch {
                // Continue searching upward
                currentDir = path.dirname(currentDir);
            }
        }

        return null; // Empty environment if not found
    }

    /**
     * Read dependencies-lock.json from userPreferences
     */
    async readLock(): Promise<LockFile | null> {
        const lockFile = await this.getLockFilePath();

        try {
            const content = await fs.readFile(lockFile, 'utf-8');
            return JSON.parse(content);
        } catch {
            return null;
        }
    }

    /**
     * Write lock file
     */
    async writeLock(lock: LockFile): Promise<void> {
        const lockFile = await this.getLockFilePath();
        await fs.mkdir(path.dirname(lockFile), { recursive: true });
        await fs.writeFile(lockFile, JSON.stringify(lock, null, 2));
    }

    /**
     * Read dependencies-pref.json from userPreferences
     */
    async readUserPreferences(): Promise<UserPreferences> {
        const prefFile = await this.getUserPreferencesPath('dependencies-pref.json');

        try {
            const content = await fs.readFile(prefFile, 'utf-8');
            return JSON.parse(content);
        } catch {
            return {}; // Empty preferences if not found
        }
    }

    /**
     * Write user preferences
     */
    async writeUserPreferences(prefs: UserPreferences): Promise<void> {
        const prefFile = await this.getUserPreferencesPath('dependencies-pref.json');
        await fs.mkdir(path.dirname(prefFile), { recursive: true });
        await fs.writeFile(prefFile, JSON.stringify(prefs, null, 2));
    }

    /**
     * Build Environment object from all configuration sources
     */
    async buildEnvironment(cacheFolder?: string): Promise<Environment | null> {
        const envFile = await this.readEnvironment();
        if (!envFile) {
            return null;
        }

        return {
            cacheFolder: cacheFolder || this.getDefaultCacheFolder(),
            github: this.buildGitHubConfig(envFile.github),
            fetch: this.buildFetchConfig(envFile.fetch),
            update: this.buildUpdateConfig(envFile.update),
            trace: envFile.trace || false,
            debug: envFile.debug || false,
            dependencies: envFile.dependencies || {},
            devDependencies: envFile.devDependencies || {}
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
    private async getLockFilePath(): Promise<string> {
        return this.getUserPreferencesPath('dependencies-lock.json');
    }

    /**
     * Get user preferences directory path
     */
    private async getUserPreferencesPath(filename: string): Promise<string> {
        // Get username
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
     * Get project path
     */
    getProjectPath(): string {
        return this.projectPath;
    }
}