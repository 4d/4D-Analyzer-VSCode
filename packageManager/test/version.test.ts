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

  describe('isMain flag', () => {
    it('should set isMain for version "0"', () => {
      const v = new Version('0');
      expect(v.isMain).toBe(true);
      expect(v.major).toBe(0);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
    });

    it('should set isMain for any version with major=0', () => {
      const v = new Version('0.1.0');
      expect(v.isMain).toBe(true);
    });

    it('should not set isMain for non-zero major versions', () => {
      const v = new Version('1.0.0');
      expect(v.isMain).toBe(false);
    });

    it('should not set isMain for 4D R-Release versions', () => {
      const v = new Version('20R2');
      expect(v.isMain).toBe(false);
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

  describe('4D R-Release compact format with patch (20R2.1)', () => {
    it('should parse compact R-Release with patch (20R2.1)', () => {
      const v = new Version('20R2.1');
      expect(v.major).toBe(20);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(1);
      expect(v.isR).toBe(true);
    });

    it('should parse compact R-Release with multi-digit patch (20R3.42)', () => {
      const v = new Version('20R3.42');
      expect(v.major).toBe(20);
      expect(v.minor).toBe(3);
      expect(v.patch).toBe(42);
      expect(v.isR).toBe(true);
    });

    it('should correctly compare R-Release with patch against same minor (20R2 < 20R2.1)', () => {
      const v1 = new Version('20R2');
      const v2 = new Version('20R2.1');
      expect(v1.lt(v2)).toBe(true);
      expect(v2.gt(v1)).toBe(true);
    });

    it('20R2.3 and 20.R2.3 should be equivalent', () => {
      const a = new Version('20R2.3');
      const b = new Version('20.R2.3');
      expect(a.eq(b)).toBe(true);
      expect(a.major).toBe(b.major);
      expect(a.minor).toBe(b.minor);
      expect(a.patch).toBe(b.patch);
    });
  });

  describe('compare() method', () => {
    it('should return -1 when less than', () => {
      const v1 = new Version('1.0.0');
      const v2 = new Version('2.0.0');
      expect(v1.compare(v2)).toBe(-1);
    });

    it('should return 1 when greater than', () => {
      const v1 = new Version('2.0.0');
      const v2 = new Version('1.0.0');
      expect(v1.compare(v2)).toBe(1);
    });

    it('should return 0 when equal', () => {
      const v1 = new Version('1.2.3');
      const v2 = new Version('1.2.3');
      expect(v1.compare(v2)).toBe(0);
    });

    it('should compare patch correctly (1.0.1 < 1.0.2)', () => {
      const v1 = new Version('1.0.1');
      const v2 = new Version('1.0.2');
      expect(v1.compare(v2)).toBe(-1);
      expect(v2.compare(v1)).toBe(1);
    });

    it('should compare minor correctly (1.1.0 < 1.2.0)', () => {
      const v1 = new Version('1.1.0');
      const v2 = new Version('1.2.0');
      expect(v1.compare(v2)).toBe(-1);
    });

    it('should compare R-Release versions (20R2 < 20R3)', () => {
      const v1 = new Version('20R2');
      const v2 = new Version('20R3');
      expect(v1.compare(v2)).toBe(-1);
      expect(v2.compare(v1)).toBe(1);
    });

    it('should compare R-Release with patch (20R2 < 20R2.1)', () => {
      const v1 = new Version('20R2');
      const v2 = new Version('20R2.1');
      expect(v1.compare(v2)).toBe(-1);
    });

    it('should treat prerelease as less than release (1.0.0-alpha < 1.0.0)', () => {
      const v1 = new Version('1.0.0-alpha');
      const v2 = new Version('1.0.0');
      expect(v1.compare(v2)).toBe(-1);
      expect(v2.compare(v1)).toBe(1);
    });

    it('should compare prerelease lexically (1.0.0-alpha < 1.0.0-beta)', () => {
      const v1 = new Version('1.0.0-alpha');
      const v2 = new Version('1.0.0-beta');
      expect(v1.compare(v2)).toBe(-1);
    });

    it('should compare prerelease lexically (1.0.0-beta < 1.0.0-rc)', () => {
      const v1 = new Version('1.0.0-beta');
      const v2 = new Version('1.0.0-rc');
      expect(v1.compare(v2)).toBe(-1);
    });
  });

  describe('toIDEString() method', () => {
    it('should return major.minor.patch string for standard version', () => {
      const v = new Version('1.2.3');
      expect(v.toIDEString()).toBe('1.2.3');
    });

    it('should return major.minor.0 for R-Release without patch (20R2)', () => {
      const v = new Version('20R2');
      expect(v.toIDEString()).toBe('20.2.0');
    });

    it('should return major.minor.patch for R-Release with patch (20.R2.3)', () => {
      const v = new Version('20.R2.3');
      expect(v.toIDEString()).toBe('20.2.3');
    });

    it('should strip prerelease and build metadata', () => {
      const v = new Version('1.2.3-alpha.1+build.42');
      expect(v.toIDEString()).toBe('1.2.3');
    });
  });

  describe('toSemanticString() method', () => {
    it('should return plain semver string for basic version', () => {
      const v = new Version('1.2.3');
      expect(v.toSemanticString()).toBe('1.2.3');
    });

    it('should include prerelease in output', () => {
      const v = new Version('1.0.0-alpha.1');
      expect(v.toSemanticString()).toBe('1.0.0-alpha.1');
    });

    it('should include build metadata in output', () => {
      const v = new Version('1.0.0+build.123');
      expect(v.toSemanticString()).toBe('1.0.0+build.123');
    });

    it('should include both prerelease and build metadata', () => {
      const v = new Version('1.0.0-alpha+build');
      expect(v.toSemanticString()).toBe('1.0.0-alpha+build');
    });
  });

  describe('Version.parse() static method', () => {
    it('should return a Version instance for valid string', () => {
      const v = Version.parse('1.2.3');
      expect(v).not.toBeNull();
      expect(v!.major).toBe(1);
      expect(v!.minor).toBe(2);
      expect(v!.patch).toBe(3);
    });

    it('should return null for invalid string instead of throwing', () => {
      expect(Version.parse('invalid')).toBeNull();
      expect(Version.parse('')).toBeNull();
      expect(Version.parse('not.a.version!')).toBeNull();
    });

    it('should parse R-Release via static method', () => {
      const v = Version.parse('20R2');
      expect(v).not.toBeNull();
      expect(v!.isR).toBe(true);
      expect(v!.major).toBe(20);
    });
  });

  describe('Version.isValid() static method', () => {
    it('should return true for valid versions', () => {
      expect(Version.isValid('1.2.3')).toBe(true);
      expect(Version.isValid('v1.2.3')).toBe(true);
      expect(Version.isValid('20R2')).toBe(true);
      expect(Version.isValid('20.R2.3')).toBe(true);
      expect(Version.isValid('1.0.0-alpha')).toBe(true);
    });

    it('should return false for invalid versions', () => {
      expect(Version.isValid('invalid')).toBe(false);
      expect(Version.isValid('')).toBe(false);
      expect(Version.isValid('abc.def.ghi')).toBe(false);
    });
  });

  describe('Prerelease comparisons', () => {
    it('prerelease should be less than release (lt)', () => {
      const alpha = new Version('1.0.0-alpha');
      const release = new Version('1.0.0');
      expect(alpha.lt(release)).toBe(true);
      expect(release.lt(alpha)).toBe(false);
    });

    it('prerelease ordering: alpha < beta (compare)', () => {
      const alpha = new Version('1.0.0-alpha');
      const beta = new Version('1.0.0-beta');
      expect(alpha.compare(beta)).toBe(-1);
      expect(alpha.eq(beta)).toBe(false);
    });

    it('same prerelease should be equal', () => {
      const v1 = new Version('1.0.0-alpha');
      const v2 = new Version('1.0.0-alpha');
      expect(v1.eq(v2)).toBe(true);
      expect(v1.compare(v2)).toBe(0);
    });
  });

  describe('R-Release comparisons', () => {
    it('20R2 lt 20R3 should be true', () => {
      expect(new Version('20R2').lt(new Version('20R3'))).toBe(true);
    });

    it('20R3 gt 20R2 should be true', () => {
      expect(new Version('20R3').gt(new Version('20R2'))).toBe(true);
    });

    it('20R2 eq 20.R2 should be true', () => {
      expect(new Version('20R2').eq(new Version('20.R2'))).toBe(true);
    });

    it('20R2.3 eq 20.R2.3 should be true', () => {
      expect(new Version('20R2.3').eq(new Version('20.R2.3'))).toBe(true);
    });

    it('20R2.3 gt 20R2.2 should be true', () => {
      expect(new Version('20R2.3').gt(new Version('20R2.2'))).toBe(true);
    });

    it('20R2.3 gte 20R2.3 should be true', () => {
      expect(new Version('20R2.3').gte(new Version('20R2.3'))).toBe(true);
    });

    it('20R2 compare 20R2 should be 0', () => {
      expect(new Version('20R2').compare(new Version('20R2'))).toBe(0);
    });
  });

  describe('R-Release vs LTS cross-type comparisons', () => {
    it('20R2 gt 20.2.0 (same minor number)', () => {
      expect(new Version('20R2').gt(new Version('20.2.0'))).toBe(true);
      expect(new Version('20.2.0').lt(new Version('20R2'))).toBe(true);
    });

    it('20R2 gt 20.5.0 (LTS has bigger minor)', () => {
      // R-release beats LTS regardless of minor number within same major
      expect(new Version('20R2').gt(new Version('20.5.0'))).toBe(true);
      expect(new Version('20.5.0').lt(new Version('20R2'))).toBe(true);
    });

    it('20R1 gt 20.9.9 (R minor smaller than LTS minor)', () => {
      expect(new Version('20R1').gt(new Version('20.9.9'))).toBe(true);
    });

    it('20R2 not equal to 20.2.0', () => {
      expect(new Version('20R2').eq(new Version('20.2.0'))).toBe(false);
    });

    it('21.0.0 gt 20R9 (different major)', () => {
      expect(new Version('21.0.0').gt(new Version('20R9'))).toBe(true);
      expect(new Version('20R9').lt(new Version('21.0.0'))).toBe(true);
    });

    it('compare returns 1 for 20R2 vs 20.5.0', () => {
      expect(new Version('20R2').compare(new Version('20.5.0'))).toBe(1);
      expect(new Version('20.5.0').compare(new Version('20R2'))).toBe(-1);
    });
  });
});
