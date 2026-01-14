import { describe, it, expect } from 'vitest';
import { PackageManager } from '../src/index';

describe('Package Exports', () => {
  it('should export PackageManager class', () => {
    expect(PackageManager).toBeDefined();
    expect(typeof PackageManager).toBe('function');
  });
});
