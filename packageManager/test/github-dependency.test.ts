import { describe, it, expect } from 'vitest';
import { GitHubDependency } from '../src/dependency/GithubDependency';
import type { DependencySpec, LockEntry } from '../src/types';

describe('GitHubDependency', () => {
  describe('constructor', () => {
    it('should parse owner and repo from github URL', () => {
      const spec: DependencySpec = {
        github: 'facebook/react',
        version: '^18.0.0',
      };
      const dep = new GitHubDependency(spec, true);
      
      expect(dep.owner).toBe('facebook');
      expect(dep.name).toBe('react');
      expect(dep.repo).toBe('react');
      expect(dep.ID).toBe('facebook/react');
      expect(dep.isPrimary).toBe(true);
    });

    it('should handle malformed github URLs with no slash', () => {
      const spec: DependencySpec = {
        github: 'invalid',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);
      
      expect(dep.owner).toBe('');
      expect(dep.name).toBe('');
      expect(dep.ID).toBeUndefined();
    });

    it('should handle github URLs with too many slashes', () => {
      const spec: DependencySpec = {
        github: 'owner/repo/extra',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, false);
      
      expect(dep.owner).toBe('');
      expect(dep.name).toBe('');
      expect(dep.ID).toBeUndefined();
    });

    it('should handle missing github URL', () => {
      const spec: DependencySpec = {
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, false);
      
      expect(dep.owner).toBe('');
      expect(dep.name).toBe('');
      expect(dep.ID).toBeUndefined();
    });

    it('should handle empty github URL', () => {
      const spec: DependencySpec = {
        github: '',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);
      
      expect(dep.owner).toBe('');
      expect(dep.name).toBe('');
      expect(dep.ID).toBeUndefined();
    });

    it('should preserve version and tag from spec', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^2.0.0',
        tag: 'v2.1.0',
      };
      const dep = new GitHubDependency(spec, false);
      
      expect(dep.version).toBe('^2.0.0');
      expect(dep.tag).toBe('v2.1.0');
      expect(dep.isPrimary).toBe(false);
    });

    it('should handle empty version and tag', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
      };
      const dep = new GitHubDependency(spec, true);
      
      expect(dep.version).toBe('');
      expect(dep.tag).toBe('');
    });

    it('should handle github URLs with trailing slash', () => {
      const spec: DependencySpec = {
        github: 'owner/repo/',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);
      
      // Third element would be empty string
      expect(dep.owner).toBe('');
      expect(dep.name).toBe('');
    });

    it('should handle github URLs with leading slash', () => {
      const spec: DependencySpec = {
        github: '/owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);
      
      // First element would be empty string
      expect(dep.owner).toBe('');
      expect(dep.name).toBe('');
    });
  });

  describe('reconcileWithEnv', () => {
    it('should reconcile with environment spec', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);

      const envSpec: DependencySpec = {
        github: 'owner/repo',
        version: '1.5.0',
      };

      dep.reconcileWithEnv(envSpec);
      
      // Verify the dependency has been updated
      expect(dep.version).toBe('1.5.0');
    });
  });

  describe('reconcileWithLock', () => {
    it('should restore tag from lock entry when update is false', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);

      const lockEntry: LockEntry = {
        tag: 'v1.2.3',
        path: '/cache/owner-repo/v1.2.3',
        found: true,
      };

      dep.reconcileWithLock(lockEntry, false);
      
      // Tag should be restored from lock
      expect(dep.tag).toBe('v1.2.3');
    });

    it('should not override existing tag from spec when reconciling with lock', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
        tag: 'v2.0.0',
      };
      const dep = new GitHubDependency(spec, true);

      const lockEntry: LockEntry = {
        tag: 'v1.2.3',
        path: '/cache/owner-repo/v1.2.3',
        found: true,
      };

      dep.reconcileWithLock(lockEntry, false);
      
      // Tag from spec should take precedence (restoreFromLock only sets if !this._tag)
      expect(dep.tag).toBe('v2.0.0');
    });

    it('should ignore lock when update is true', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);

      const lockEntry: LockEntry = {
        tag: 'v1.2.3',
        path: '/cache/owner-repo/v1.2.3',
        found: true,
      };

      dep.reconcileWithLock(lockEntry, true);
      
      // Should not restore tag when updating
      expect(dep.tag).toBe('');
    });

    it('should handle undefined lock entry', () => {
      const spec: DependencySpec = {
        github: 'owner/repo',
        version: '^1.0.0',
      };
      const dep = new GitHubDependency(spec, true);

      dep.reconcileWithLock(undefined, false);
      
      // Should not crash
      expect(dep.tag).toBe('');
    });
  });
});
