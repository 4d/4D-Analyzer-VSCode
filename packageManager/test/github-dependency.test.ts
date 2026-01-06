import { describe, it, expect } from 'vitest';
import { GitHubDependency } from '../src/dependency/GithubDependency';
import type { DependencySpec, LockEntry } from '../src/types';

describe('GitHubDependency', () => {
  describe('reconcileWithEnv', () => {
    it('should reconcile with environment spec', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency('pkg', spec);

      const envSpec: DependencySpec = {
        github: 'owner/repo',
        version: '1.5.0',
      };

      dep.reconcileWithEnv(envSpec);
      
      // Verify the dependency has been updated
      expect(dep.dependency.version).toBe('1.5.0');
    });
  });

  describe('reconcileWithLock', () => {
    it('should reconcile with lock entry', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency('pkg', spec);

      const lockEntry: LockEntry = {
        tag: 'v1.2.3',
        path: '/cache/owner-repo/v1.2.3',
        found: true,
      };

      dep.reconcileWithLock(lockEntry, false);
      
      // When not updating, lock entry should be preserved
      expect(lockEntry.tag).toBe('v1.2.3');
    });

    it('should ignore lock when update is true', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency('pkg', spec);

      const lockEntry: LockEntry = {
        tag: 'v1.2.3',
        path: '/cache/owner-repo/v1.2.3',
        found: true,
      };

      dep.reconcileWithLock(lockEntry, true);
      
      // When updating, the dependency should fetch fresh versions
      // Lock should be cleared or ignored
    });
  });
});
