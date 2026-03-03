import { describe, it, expect } from 'vitest';
import { GitHubDependency } from '../src/dependency/GithubDependency';
import type { DependencySpec } from '../src/types';

/**
 * Tests for Dependency.mergeWithEnv (via GitHubDependency.reconcileWithEnv)
 */
describe('mergeWithEnv', () => {
    describe('string override (local path)', () => {
        it('should clear owner and name when env provides a string path', () => {
            const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
            const dep = new GitHubDependency(spec, true);

            // String envSpec → local path override
            dep.reconcileWithEnv('/local/path/to/component');

            expect(dep.owner).toBe('');
            expect(dep.name).toBe('');
        });
    });

    describe('DependencySpec override', () => {
        it('should override version from environment', () => {
            const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
            const dep = new GitHubDependency(spec, true);

            dep.reconcileWithEnv({ version: '2.0.0' });

            expect(dep.version).toBe('2.0.0');
            // github should remain unchanged
            expect(dep.ID).toBe('owner/repo');
        });

        it('should override github from environment', () => {
            const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
            const dep = new GitHubDependency(spec, true);

            dep.reconcileWithEnv({ github: 'other/component' });

            expect(dep.owner).toBe('other');
            expect(dep.name).toBe('component');
            expect(dep.ID).toBe('other/component');
        });

        it('should override tag from environment', () => {
            const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
            const dep = new GitHubDependency(spec, true);

            dep.reconcileWithEnv({ tag: 'v3.0.0-custom' });

            expect(dep.tag).toBe('v3.0.0-custom');
        });

        it('should clear github when env provides empty string', () => {
            const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0' };
            const dep = new GitHubDependency(spec, true);

            dep.reconcileWithEnv({ github: '' });

            expect(dep.owner).toBe('');
            expect(dep.name).toBe('');
        });

        it('should not override fields that are undefined in env spec', () => {
            const spec: DependencySpec = { github: 'owner/repo', version: '^1.0.0', tag: 'v1.0.0' };
            const dep = new GitHubDependency(spec, true);

            dep.reconcileWithEnv({ version: '2.0.0' });

            // Only version should change; tag and github should remain
            expect(dep.version).toBe('2.0.0');
            expect(dep.tag).toBe('v1.0.0');
            expect(dep.ID).toBe('owner/repo');
        });
    });
});
