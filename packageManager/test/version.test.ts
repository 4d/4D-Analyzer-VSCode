import { describe, it, expect } from 'vitest';
import { Version } from '../src/version/Version';

describe('Version', () => {
  describe('Standard semver parsing', () => {
    it('should parse basic version', () => {
      const v = new Version('1.2.3');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(3);
      expect(v.isR).toBe(false);
    });

    it('should parse version with v prefix', () => {
      const v = new Version('v2.5.10');
      expect(v.major).toBe(2);
      expect(v.minor).toBe(5);
      expect(v.patch).toBe(10);
    });

    it('should parse version with prerelease', () => {
      const v = new Version('1.0.0-alpha.1');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
      expect(v.prerelease).toEqual(['alpha', 1]);
    });

    it('should parse version with build metadata', () => {
      const v = new Version('1.0.0+build.123');
      expect(v.major).toBe(1);
      expect(v.build).toEqual(['build', '123']);
    });
  });

  describe('4D R-Release formats', () => {
    it('should parse 2-digit R-Release format (20R2)', () => {
      const v = new Version('20R2');
      expect(v.major).toBe(20);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(0);
      expect(v.isR).toBe(true);
    });

    it('should parse dotted R-Release format (20.R2.3)', () => {
      const v = new Version('20.R2.3');
      expect(v.major).toBe(20);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(3);
      expect(v.isR).toBe(true);
    });

    it('should parse dotted R-Release without patch (20.R2)', () => {
      const v = new Version('20.R2');
      expect(v.major).toBe(20);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(0);
      expect(v.isR).toBe(true);
    });
  });

  describe('Comparison methods', () => {
    it('should compare versions with gt', () => {
      const v1 = new Version('2.0.0');
      const v2 = new Version('1.0.0');
      expect(v1.gt(v2)).toBe(true);
      expect(v2.gt(v1)).toBe(false);
    });

    it('should compare versions with gte', () => {
      const v1 = new Version('2.0.0');
      const v2 = new Version('2.0.0');
      const v3 = new Version('1.0.0');
      expect(v1.gte(v2)).toBe(true);
      expect(v1.gte(v3)).toBe(true);
      expect(v3.gte(v1)).toBe(false);
    });

    it('should compare versions with lt', () => {
      const v1 = new Version('1.0.0');
      const v2 = new Version('2.0.0');
      expect(v1.lt(v2)).toBe(true);
      expect(v2.lt(v1)).toBe(false);
    });

    it('should compare versions with lte', () => {
      const v1 = new Version('1.0.0');
      const v2 = new Version('1.0.0');
      const v3 = new Version('2.0.0');
      expect(v1.lte(v2)).toBe(true);
      expect(v1.lte(v3)).toBe(true);
      expect(v3.lte(v1)).toBe(false);
    });

    it('should check equality with eq', () => {
      const v1 = new Version('1.2.3');
      const v2 = new Version('1.2.3');
      const v3 = new Version('1.2.4');
      expect(v1.eq(v2)).toBe(true);
      expect(v1.eq(v3)).toBe(false);
    });


  });

  describe('String conversion', () => {
    it('should convert to string', () => {
      const v = new Version('1.2.3');
      expect(v.toString()).toBe('1.2.3');
    });

    it('should convert R-Release to string', () => {
      const v = new Version('20R2');
      expect(v.toString()).toBe('20.2.0');
    });
  });

  describe('Error handling', () => {
    it('should throw error for invalid version', () => {
      expect(() => new Version('invalid')).toThrow('Invalid version');
    });

    it('should throw error for empty string', () => {
      expect(() => new Version('')).toThrow('Invalid version');
    });
  });

  describe('VersionInfo export', () => {
    it('should export version info', () => {
      const v = new Version('1.2.3-alpha.1+build');
      const info = v.toInfo();
      expect(info.major).toBe(1);
      expect(info.minor).toBe(2);
      expect(info.patch).toBe(3);
      expect(info.isR).toBe(false);
      expect(info.raw).toBe('1.2.3-alpha.1+build');
    });

    it('should export R-Release info', () => {
      const v = new Version('20R2');
      const info = v.toInfo();
      expect(info.isR).toBe(true);
      expect(info.raw).toBe('20R2');
    });
  });
});
