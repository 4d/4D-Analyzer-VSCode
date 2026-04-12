import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DependencyOverlay } from '../managers/DependencyOverlay';

suite('Dependency Overlay', () => {
    // Create instance without vscode extension context (only using pure methods)
    const overlay = Object.create(DependencyOverlay.prototype) as DependencyOverlay;

    test('merges object overrides from environment4d.json', () => {
        const dependenciesText = JSON.stringify({
            version: 2100,
            dependencies: {
                RepoA: {
                    github: 'owner/repo-a',
                    version: '^1.0.0'
                }
            }
        }, null, 2);

        const envText = JSON.stringify({
            dependencies: {
                RepoA: {
                    version: '^2.0.0',
                    tag: 'v2.1.0'
                }
            }
        }, null, 2);

        const [hint] = overlay.buildEnvHints(dependenciesText, envText);
        assert.ok(hint);
        assert.strictEqual(hint.dependencyName, 'RepoA');
        assert.strictEqual(hint.mergeMode, 'merge');
        assert.deepStrictEqual(hint.effectiveValue, {
            github: 'owner/repo-a',
            version: '^2.0.0',
            tag: 'v2.1.0'
        });
    });

    test('replaces dependency with string override from environment4d.json', () => {
        const dependenciesText = JSON.stringify({
            version: 2100,
            dependencies: {
                RepoB: {
                    github: 'owner/repo-b',
                    version: '^1.0.0'
                }
            }
        }, null, 2);

        const envText = JSON.stringify({
            dependencies: {
                RepoB: '../local/repo-b'
            }
        }, null, 2);

        const [hint] = overlay.buildEnvHints(dependenciesText, envText);
        assert.ok(hint);
        assert.strictEqual(hint.mergeMode, 'replace');
        assert.strictEqual(hint.effectiveValue, '../local/repo-b');
    });

    test('finds the first environment4d.json while walking upward', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-overlay-'));
        try {
            const parentDir = path.join(tempRoot, 'workspace-parent');
            const projectDir = path.join(parentDir, 'project');
            const sourcesDir = path.join(projectDir, 'Project', 'Sources');
            fs.mkdirSync(sourcesDir, { recursive: true });
            fs.writeFileSync(path.join(parentDir, 'environment4d.json'), '{}');
            fs.writeFileSync(path.join(tempRoot, 'environment4d.json'), '{}');

            const found = overlay.findNearestEnvironmentFileSync(projectDir);
            assert.strictEqual(found, path.join(parentDir, 'environment4d.json'));
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('returns undefined when no environment4d.json exists', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-overlay-'));
        try {
            const found = overlay.findNearestEnvironmentFileSync(tempRoot);
            assert.strictEqual(found, undefined);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});
