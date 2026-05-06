import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { PackageManager } from '../../src/PackageManager';
import { GithubFetcher } from '../../src/dependency/GithubFetcher';
const TEST_IDE_VERSION = "21.2.0";

// Only mock external dependencies (GitHub API)
vi.mock('../../src/dependency/GithubFetcher');

// Test paths - use real filesystem
const TEST_ROOT = path.resolve(__dirname, '..');
const RESOURCES_PATH = path.join(TEST_ROOT, 'Resources');
const OUTPUT_PATH = path.join(TEST_ROOT, 'OUTPUT');
const TEST_ZIP_PATH = path.join(RESOURCES_PATH, 'TEST.zip');

describe('PackageManager Integration', () => {
    let projectPath: string;
    let cachePath: string;
    let testZipBuffer: ArrayBuffer;

    // Sample dependency files
    const dependenciesJson = {
        version: 2100,
        dependencies: {
            'TEST': {
                github: 'test-org/TEST',
                version: '^1.0.0'
            }
        }
    };

    const environmentJson = {
        dependencies: {},
        github: {
            htmlURL: 'https://github.com'
        },
        fetch: {
            maxRecursivePass: 5
        }
    };

    // Load the real TEST.zip file once before all tests
    beforeAll(async () => {
        // Read the real TEST.zip from Resources
        const zipData = await fs.readFile(TEST_ZIP_PATH);
        testZipBuffer = zipData.buffer.slice(zipData.byteOffset, zipData.byteOffset + zipData.byteLength);
    });

    beforeEach(async () => {
        // Create OUTPUT directory for cache
        await fs.mkdir(OUTPUT_PATH, { recursive: true });

        // Create a unique project folder and cache folder for each test
        const testId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
        projectPath = path.join(OUTPUT_PATH, `TestProject-${testId}`);
        cachePath = path.join(OUTPUT_PATH, `cache-${testId}`);

        // Create project structure
        await fs.mkdir(path.join(projectPath, 'Project', 'Sources'), { recursive: true });

        // Write dependencies.json
        await fs.writeFile(
            path.join(projectPath, 'Project', 'Sources', 'dependencies.json'),
            JSON.stringify(dependenciesJson, null, 2)
        );

        // Write environment4d.json
        await fs.writeFile(
            path.join(projectPath, 'environment4d.json'),
            JSON.stringify(environmentJson, null, 2)
        );

        // Setup GithubFetcher mock - returns the real TEST.zip content
        vi.mocked(GithubFetcher).mockImplementation(() => ({
            rateLimit: vi.fn().mockResolvedValue(5000),
            getLatestRelease: vi.fn().mockResolvedValue({
                id: 1,
                tag_name: 'v1.2.0',
                name: 'v1.2.0',
                draft: false,
                prerelease: false
            }),
            getReleases: vi.fn().mockResolvedValue([
                { id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false },
                { id: 2, tag_name: 'v1.1.0', name: 'v1.1.0', draft: false, prerelease: false },
                { id: 3, tag_name: 'v1.2.0', name: 'v1.2.0', draft: false, prerelease: false },
            ]),
            downloadReleaseAsset: vi.fn().mockResolvedValue(testZipBuffer),
        }) as unknown as GithubFetcher);
    });

    afterEach(async () => {
        vi.clearAllMocks();
    });

    // Clean up OUTPUT folder after all tests
    afterAll(async () => {
        try {
            await fs.rm(OUTPUT_PATH, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('Full workflow', () => {
        it('should initialize and read configuration files', async () => {
            const pm = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);

            // Should not throw
            await expect(pm.initialize()).resolves.not.toThrow();
        });

        it('should fetch dependencies and extract to cache', async () => {
            const pm = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);
            await pm.initialize();

            const result = await pm.fetch();

            expect(result.success).toBe(true);
            expect(result.lock).toBeDefined();
            expect(result.lock.dependencies['TEST']).toBeDefined();
            expect(result.lock.dependencies['TEST'].tag).toBe('v1.2.0');
            expect(result.lock.dependencies['TEST'].found).toBe(true);

            // Verify the dependency was actually extracted to the cache
            const extractedPath = result.lock.dependencies['TEST'].path;
            expect(extractedPath).toBeDefined();
            expect(fsSync.existsSync(extractedPath!)).toBe(true);
        });

        it('should extract Contents folder from archive correctly', async () => {
            const pm = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);
            await pm.initialize();

            const result = await pm.fetch();

            // The TEST.zip contains Contents/TEST.4DZ
            // Verify extraction worked
            const extractedPath = result.lock.dependencies['TEST'].path;
            expect(extractedPath).toBeDefined();

            // Check that the extracted content exists
            const cacheDir = await fs.readdir(extractedPath!);
            expect(cacheDir.length).toBeGreaterThan(0);
        });

        it('should skip fetch when dependency is already cached', async () => {
            const pm = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);
            await pm.initialize();

            // First fetch
            const result1 = await pm.fetch();
            expect(result1.fetchedCount).toBe(1);

            // Second fetch should skip (already cached)
            const pm2 = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);
            await pm2.initialize();
            const result2 = await pm2.fetch();

            expect(result2.skippedCount).toBe(1);
            expect(result2.fetchedCount).toBe(0);
        });

        it('should force re-fetch with update option', async () => {
            const pm = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);
            await pm.initialize();

            // First fetch
            await pm.fetch();

            // Second fetch with update should re-fetch
            const pm2 = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);
            await pm2.initialize();
            const result2 = await pm2.fetch({ update: true });

            expect(result2.fetchedCount).toBe(1);
            expect(result2.skippedCount).toBe(0);
        });

        it('should filter dependencies when filter option is provided', async () => {
            // Add a second dependency
            const multiDeps = {
                version: 2100,
                dependencies: {
                    'TEST': { github: 'test-org/TEST', version: '^1.0.0' },
                    'Component2': { github: 'org/Component2', version: '^2.0.0' }
                }
            };
            await fs.writeFile(
                path.join(projectPath, 'Project', 'Sources', 'dependencies.json'),
                JSON.stringify(multiDeps, null, 2)
            );

            const pm = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);
            await pm.initialize();

            const result = await pm.fetch({ filter: ['TEST'] });

            expect(result.fetchedCount).toBe(1);
            expect(result.lock.dependencies['TEST']).toBeDefined();
            expect(result.lock.dependencies['TEST'].found).toBe(true);
            // Component2 should not be fetched
            expect(result.lock.dependencies['Component2']?.found).toBeFalsy();
        });
    });

    describe('Error handling', () => {
        it('should resolve when project path does not exist', async () => {
            const pm = new PackageManager(path.join(cachePath, 'nonexistent'), TEST_IDE_VERSION, undefined, cachePath);

            await expect(pm.initialize()).resolves.toBeUndefined();
        });

        it('should resolve when dependencies.json is missing', async () => {
            // Remove dependencies.json
            await fs.rm(path.join(projectPath, 'Project', 'Sources', 'dependencies.json'));

            const pm = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);

            await expect(pm.initialize()).resolves.toBeUndefined();
        });

        it('should handle download errors gracefully', async () => {
            // Mock download to fail
            vi.mocked(GithubFetcher).mockImplementation(() => ({
                rateLimit: vi.fn().mockResolvedValue(5000),
                getLatestRelease: vi.fn().mockResolvedValue({
                    id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false
                }),
                getReleases: vi.fn().mockResolvedValue([
                    { id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false },
                ]),
                downloadReleaseAsset: vi.fn().mockRejectedValue(new Error('Network error')),
            }) as unknown as GithubFetcher);

            const pm = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);
            await pm.initialize();

            const result = await pm.fetch();

            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.lock.dependencies['TEST'].found).toBe(false);
        });
    });

    describe('Cache structure', () => {
        it('should create cache in OUTPUT folder with correct structure', async () => {
            const pm = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);
            await pm.initialize();

            await pm.fetch();

            // Verify cache folder was created
            const cacheExists = fsSync.existsSync(cachePath);
            expect(cacheExists).toBe(true);

            // Verify .github folder structure
            const githubPath = path.join(cachePath, '.github');
            const githubExists = fsSync.existsSync(githubPath);
            expect(githubExists).toBe(true);
        });

        it('should save metadata for cached dependency', async () => {
            const pm = new PackageManager(projectPath, TEST_IDE_VERSION, undefined, cachePath);
            await pm.initialize();

            await pm.fetch();

            // Check for metadata file
            const metadataPath = path.join(cachePath, '.github', 'test-org', 'TEST', 'v1.2.0.json');
            const metadataExists = fsSync.existsSync(metadataPath);
            expect(metadataExists).toBe(true);

            if (metadataExists) {
                const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
                expect(metadata.tag).toBe('v1.2.0');
                expect(metadata.github).toBe('test-org/TEST');
            }
        });
    });
});
