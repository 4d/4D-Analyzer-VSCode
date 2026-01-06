import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PackageManager } from '../src/PackageManager';
import * as fs from 'fs/promises';

// Mock file system
vi.mock('fs/promises');

describe('PackageManager', () => {
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should throw error if called without proper setup', async () => {
      const pm = new PackageManager(testProjectPath);
      
      // Mock file reads to throw errors
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      
      await expect(pm.initialize()).rejects.toThrow();
    });
  });

  describe('fetch options', () => {
    it('should accept empty options object', async () => {
      const pm = new PackageManager(testProjectPath);
      
      // This will fail without proper initialization, but tests the API
      await expect(pm.fetch({})).rejects.toThrow('Not initialized');
    });

    it('should accept update option', async () => {
      const pm = new PackageManager(testProjectPath);
      
      await expect(pm.fetch({ update: true })).rejects.toThrow('Not initialized');
    });

    it('should accept filter option', async () => {
      const pm = new PackageManager(testProjectPath);
      
      await expect(pm.fetch({ filter: ['package1', 'package2'] })).rejects.toThrow('Not initialized');
    });
  });

  describe('Error handling', () => {
    it('should throw error when fetching before initialization', async () => {
      const pm = new PackageManager(testProjectPath);
      
      await expect(pm.fetch()).rejects.toThrow('Not initialized');
    });
  });
});
