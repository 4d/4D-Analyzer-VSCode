import { describe, it, expect } from 'vitest';
import { GitHubDependency } from '../src/dependency/GithubDependency';
import type { LockEntry, DependencySpec } from '../src/types';

/**
 * Tests for Dependency.compare() / compareWith() / handleConflict()
 */
describe('Conflict Detection', () => {
    function makeDep(spec: DependencySpec, isPrimary: boolean): GitHubDependency {
        return new GitHubDependency(spec, isPrimary);
    }

    describe('tag vs tag', () => {
        it('should detect conflict when tags differ for same repo', () => {
            const dep1 = makeDep({ github: 'owner/repo', tag: 'v1.0.0' }, true);
            const dep2 = makeDep({ github: 'owner/repo', tag: 'v2.0.0' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            // Primary dependency → warning
            expect(lock.warnings).toBeDefined();
            expect(lock.warnings?.length).toBeGreaterThan(0);
            expect(lock.warnings?.[0].message).toContain('v1.0.0');
            expect(lock.warnings?.[0].message).toContain('v2.0.0');
        });

        it('should mark secondary dependency as conflict with error', () => {
            const dep1 = makeDep({ github: 'owner/repo', tag: 'v1.0.0' }, false);
            const dep2 = makeDep({ github: 'owner/repo', tag: 'v2.0.0' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            expect(lock.conflict).toBe(true);
            expect(lock.errors).toBeDefined();
            expect(lock.errors?.length).toBeGreaterThan(0);
            expect(lock.path).toBeUndefined();
        });

        it('should not detect conflict when tags are identical', () => {
            const dep1 = makeDep({ github: 'owner/repo', tag: 'v1.0.0' }, true);
            const dep2 = makeDep({ github: 'owner/repo', tag: 'v1.0.0' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            expect(lock.conflict).toBeUndefined();
            expect(lock.errors).toBeUndefined();
            expect(lock.warnings).toBeUndefined();
        });
    });

    describe('tag vs range', () => {
        it('should not flag conflict when tag satisfies the range', () => {
            const dep1 = makeDep({ github: 'owner/repo', tag: 'v1.5.0' }, true);
            const dep2 = makeDep({ github: 'owner/repo', version: '^1.0.0' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            expect(lock.conflict).toBeUndefined();
            expect(lock.errors).toBeUndefined();
            expect(lock.warnings).toBeUndefined();
        });

        it('should flag conflict when tag does not satisfy the range', () => {
            const dep1 = makeDep({ github: 'owner/repo', tag: 'v2.0.0' }, true);
            const dep2 = makeDep({ github: 'owner/repo', version: '^1.0.0' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            expect(lock.warnings).toBeDefined();
            expect(lock.warnings?.[0].message).toContain('v2.0.0');
        });
    });

    describe('range vs range', () => {
        it('should not flag conflict when ranges intersect', () => {
            const dep1 = makeDep({ github: 'owner/repo', version: '^1.2.0' }, true);
            const dep2 = makeDep({ github: 'owner/repo', version: '^1.3.0' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            expect(lock.conflict).toBeUndefined();
            expect(lock.errors).toBeUndefined();
            expect(lock.warnings).toBeUndefined();
        });

        it('should flag conflict when ranges do not intersect', () => {
            const dep1 = makeDep({ github: 'owner/repo', version: '^1.0.0' }, true);
            const dep2 = makeDep({ github: 'owner/repo', version: '^2.0.0' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            // Primary → warning
            expect(lock.warnings).toBeDefined();
            expect(lock.warnings?.[0].message).toContain('^1.0.0');
            expect(lock.warnings?.[0].message).toContain('^2.0.0');
        });
    });

    describe('different repos', () => {
        it('should not detect conflict for different repositories', () => {
            const dep1 = makeDep({ github: 'owner/repoA', tag: 'v1.0.0' }, true);
            const dep2 = makeDep({ github: 'owner/repoB', tag: 'v2.0.0' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            expect(lock.conflict).toBeUndefined();
            expect(lock.errors).toBeUndefined();
            expect(lock.warnings).toBeUndefined();
        });
    });

    describe('edge cases', () => {
        it('should handle deps with no tag and no version (no conflict)', () => {
            const dep1 = makeDep({ github: 'owner/repo' }, true);
            const dep2 = makeDep({ github: 'owner/repo' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            expect(lock.conflict).toBeUndefined();
        });

        it('should store tags in lock when tag-vs-tag conflict', () => {
            const dep1 = makeDep({ github: 'owner/repo', tag: 'v1.0.0' }, false);
            const dep2 = makeDep({ github: 'owner/repo', tag: 'v3.0.0' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            expect(lock.tags).toEqual(['v1.0.0', 'v3.0.0']);
        });

        it('should store versions in lock when range-vs-range conflict', () => {
            const dep1 = makeDep({ github: 'owner/repo', version: '^1.0.0' }, false);
            const dep2 = makeDep({ github: 'owner/repo', version: '^2.0.0' }, false);
            const lock: LockEntry = {};

            dep1.compare(dep2, lock);

            expect(lock.versions).toEqual(['^1.0.0', '^2.0.0']);
        });
    });
});
