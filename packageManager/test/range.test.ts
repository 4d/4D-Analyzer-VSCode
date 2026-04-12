import { describe, it, expect } from 'vitest';
import { Range } from '../src/version/Range';
import { Version } from '../src/version/Version';

describe('Range', () => {
  describe('Basic range parsing', () => {
    it('should handle wildcard range', () => {
      const range = new Range('*');
      expect(range.satisfiedBy('1.0.0')).toBe(true);
      expect(range.satisfiedBy('2.5.3')).toBe(true);
      expect(range.satisfiedBy('0.0.1')).toBe(true);
    });

    it('should handle latest keyword', () => {
      const range = new Range('latest');
      expect(range.satisfiedBy('1.0.0')).toBe(true);
      expect(range.satisfiedBy('99.99.99')).toBe(true);
    });

    it('should handle exact version', () => {
      const range = new Range('1.2.3');
      expect(range.satisfiedBy('1.2.3')).toBe(true);
      expect(range.satisfiedBy('1.2.4')).toBe(false);
      expect(range.satisfiedBy('1.2.2')).toBe(false);
    });

    it('should handle caret range', () => {
      const range = new Range('^1.2.3');
      expect(range.satisfiedBy('1.2.3')).toBe(true);
      expect(range.satisfiedBy('1.3.0')).toBe(true);
      expect(range.satisfiedBy('1.9.9')).toBe(true);
      expect(range.satisfiedBy('2.0.0')).toBe(false);
      expect(range.satisfiedBy('1.2.2')).toBe(false);
    });

    it('should handle tilde range', () => {
      const range = new Range('~1.2.3');
      expect(range.satisfiedBy('1.2.3')).toBe(true);
      expect(range.satisfiedBy('1.2.4')).toBe(true);
      expect(range.satisfiedBy('1.2.9')).toBe(true);
      expect(range.satisfiedBy('1.3.0')).toBe(false);
      expect(range.satisfiedBy('1.2.2')).toBe(false);
    });

    it('should handle greater than range', () => {
      const range = new Range('>1.2.3');
      expect(range.satisfiedBy('1.2.4')).toBe(true);
      expect(range.satisfiedBy('2.0.0')).toBe(true);
      expect(range.satisfiedBy('1.2.3')).toBe(false);
      expect(range.satisfiedBy('1.2.2')).toBe(false);
    });

    it('should handle greater than or equal range', () => {
      const range = new Range('>=1.2.3');
      expect(range.satisfiedBy('1.2.3')).toBe(true);
      expect(range.satisfiedBy('1.2.4')).toBe(true);
      expect(range.satisfiedBy('2.0.0')).toBe(true);
      expect(range.satisfiedBy('1.2.2')).toBe(false);
    });

    it('should handle less than range', () => {
      const range = new Range('<2.0.0');
      expect(range.satisfiedBy('1.9.9')).toBe(true);
      expect(range.satisfiedBy('1.0.0')).toBe(true);
      expect(range.satisfiedBy('2.0.0')).toBe(false);
      expect(range.satisfiedBy('2.0.1')).toBe(false);
    });

    it('should handle range with hyphen', () => {
      const range = new Range('1.2.3 - 2.3.4');
      expect(range.satisfiedBy('1.2.3')).toBe(true);
      expect(range.satisfiedBy('2.0.0')).toBe(true);
      expect(range.satisfiedBy('2.3.4')).toBe(true);
      expect(range.satisfiedBy('1.2.2')).toBe(false);
      expect(range.satisfiedBy('2.3.5')).toBe(false);
    });
  });

  describe('Version object support', () => {
    it('should accept Version objects', () => {
      const range = new Range('^1.2.0');
      const v1 = new Version('1.2.3');
      const v2 = new Version('2.0.0');
      expect(range.satisfiedBy(v1)).toBe(true);
      expect(range.satisfiedBy(v2)).toBe(false);
    });

    it('should handle Version objects with v prefix', () => {
      const range = new Range('^1.2.0');
      const v = new Version('v1.2.3');
      expect(range.satisfiedBy(v)).toBe(true);
    });
  });

  describe('maxSatisfying', () => {
    it('should find maximum satisfying version', () => {
      const range = new Range('^1.2.0');
      const versions = ['1.2.0', '1.2.5', '1.3.0', '2.0.0'];
      expect(range.maxSatisfying(versions)).toBe('1.3.0');
    });

    it('should return null if no version satisfies', () => {
      const range = new Range('^2.0.0');
      const versions = ['1.0.0', '1.5.0', '1.9.9'];
      expect(range.maxSatisfying(versions)).toBeNull();
    });

    it('should preserve v prefix in result', () => {
      const range = new Range('^1.2.0');
      const versions = ['v1.2.0', 'v1.2.5', 'v1.3.0'];
      expect(range.maxSatisfying(versions)).toBe('v1.3.0');
    });
  });

  describe('minSatisfying', () => {
    it('should find minimum satisfying version', () => {
      const range = new Range('^1.2.0');
      const versions = ['1.2.0', '1.2.5', '1.3.0', '2.0.0'];
      expect(range.minSatisfying(versions)).toBe('1.2.0');
    });

    it('should return null if no version satisfies', () => {
      const range = new Range('^2.0.0');
      const versions = ['1.0.0', '1.5.0', '1.9.9'];
      expect(range.minSatisfying(versions)).toBeNull();
    });
  });

  describe('filter', () => {
    it('should filter versions that satisfy range', () => {
      const range = new Range('^1.2.0');
      const versions = ['1.0.0', '1.2.0', '1.2.5', '1.3.0', '2.0.0'];
      const filtered = range.filter(versions);
      expect(filtered).toEqual(['1.2.0', '1.2.5', '1.3.0']);
    });

    it('should return empty array if no versions satisfy', () => {
      const range = new Range('^2.0.0');
      const versions = ['1.0.0', '1.5.0', '1.9.9'];
      expect(range.filter(versions)).toEqual([]);
    });
  });

  describe('intersects', () => {
    it('should detect intersecting ranges', () => {
      const range1 = new Range('^1.2.0');
      const range2 = new Range('^1.3.0');
      expect(range1.intersects(range2)).toBe(true);
    });

    it('should detect non-intersecting ranges', () => {
      const range1 = new Range('^1.0.0');
      const range2 = new Range('^2.0.0');
      expect(range1.intersects(range2)).toBe(false);
    });
  });

  describe('String representation', () => {
    it('should convert to string', () => {
      const range = new Range('^1.2.3');
      expect(range.toString()).toBe('^1.2.3');
    });

    it('should preserve original range spec', () => {
      const range = new Range('>=1.2.3 <2.0.0');
      expect(range.toString()).toBe('>=1.2.3 <2.0.0');
    });
  });

  describe('Empty/null range handling', () => {
    it('should treat empty string as wildcard', () => {
      const range = new Range('');
      expect(range.satisfiedBy('1.0.0')).toBe(true);
      expect(range.satisfiedBy('99.99.99')).toBe(true);
    });
  });

  describe('4D keyword range', () => {
    it('should build caret range from IDE version', () => {
      const ide = new Version('21.2.0');
      const range = new Range('4d', ide);
      expect(range.satisfiedBy('21.2.0')).toBe(true);
      expect(range.satisfiedBy('21.3.0')).toBe(true);
      expect(range.satisfiedBy('21.9.9')).toBe(true);
      expect(range.satisfiedBy('22.0.0')).toBe(false);
      expect(range.satisfiedBy('20.0.0')).toBe(false);
    });

    it('should be case-insensitive', () => {
      const ide = new Version('21.2.0');
      const range = new Range('4D', ide);
      expect(range.satisfiedBy('21.2.0')).toBe(true);
      expect(range.satisfiedBy('22.0.0')).toBe(false);
    });

    it('should use maxSatisfying with 4d range', () => {
      const ide = new Version('21.2.0');
      const range = new Range('4d', ide);
      const versions = ['20.0.0', '21.2.0', '21.3.0', '22.0.0'];
      expect(range.maxSatisfying(versions)).toBe('21.3.0');
    });
  });

  describe('R-Release range specs', () => {
    it('should parse ^20R2 and match R versions only', () => {
      const range = new Range('^20R2');
      expect(range.satisfiedBy('20R2')).toBe(true);
      expect(range.satisfiedBy('20R2.3')).toBe(true);   // compact R with patch
      expect(range.satisfiedBy('20R3')).toBe(true);
      expect(range.satisfiedBy('20R2.5')).toBe(true);
      expect(range.satisfiedBy('20R1')).toBe(false);   // below min
      expect(range.satisfiedBy('21R2')).toBe(false);   // different major
    });

    it('LTS range should not match R versions (^20.2.0 rejects 20R5)', () => {
      const range = new Range('^20.2.0');
      expect(range.satisfiedBy(new Version('20R5'))).toBe(false);
      expect(range.satisfiedBy('20R5')).toBe(false);
      expect(range.satisfiedBy(new Version('20.5.0'))).toBe(true);
    });

    it('R range should not match LTS versions (^20R2 rejects 20.5.0)', () => {
      const range = new Range('^20R2');
      expect(range.satisfiedBy(new Version('20.5.0'))).toBe(false);
      expect(range.satisfiedBy('20.5.0')).toBe(false);
      expect(range.satisfiedBy(new Version('20R3'))).toBe(true);
    });

    it('wildcard range matches both R and LTS', () => {
      const range = new Range('*');
      expect(range.satisfiedBy(new Version('20R5'))).toBe(true);
      expect(range.satisfiedBy(new Version('20.5.0'))).toBe(true);
    });

    it('maxSatisfying on LTS range excludes R versions from list', () => {
      const range = new Range('^20.2.0');
      const versions = ['20.2.0', '20.3.0', '20R5', '20.4.0'];
      // 20R5 normalizes to 20.5.0 numerically but must be excluded (wrong type)
      expect(range.maxSatisfying(versions)).toBe('20.4.0');
    });

    it('maxSatisfying on R range excludes LTS versions from list', () => {
      const range = new Range('^20R2');
      const versions = ['20.5.0', '20R2', '20R3', '21.0.0'];
      expect(range.maxSatisfying(versions)).toBe('20R3');
    });

    it('minSatisfying on LTS range excludes R versions', () => {
      const range = new Range('^20.2.0');
      const versions = ['20R2', '20.2.0', '20.3.0'];
      expect(range.minSatisfying(versions)).toBe('20.2.0');
    });

    it('4d keyword range with R IDE version matches only R versions', () => {
      const ide = new Version('21R2');
      const range = new Range('4d', ide);
      expect(range.satisfiedBy(new Version('21R2'))).toBe(true);
      expect(range.satisfiedBy(new Version('21R3'))).toBe(true);
      expect(range.satisfiedBy(new Version('21.5.0'))).toBe(false);
      expect(range.satisfiedBy(new Version('22R1'))).toBe(false);
    });

    it('4d keyword range with LTS IDE version matches only LTS versions', () => {
      const ide = new Version('21.2.0');
      const range = new Range('4d', ide);
      expect(range.satisfiedBy(new Version('21.3.0'))).toBe(true);
      expect(range.satisfiedBy(new Version('21R3'))).toBe(false);
    });

    it('should parse ~20R2.3 and match R patch range', () => {
      const range = new Range('~20R2.3');
      expect(range.satisfiedBy('20R2.3')).toBe(true);
      expect(range.satisfiedBy('20R2.9')).toBe(true);
      expect(range.satisfiedBy('20R3')).toBe(false);  // different minor
      expect(range.satisfiedBy('20.2.3')).toBe(false);  // LTS rejected
    });
  });

  describe('less than or equal range (<=)', () => {
    it('should handle <=2.0.0 range', () => {
      const range = new Range('<=2.0.0');
      expect(range.satisfiedBy('2.0.0')).toBe(true);
      expect(range.satisfiedBy('1.9.9')).toBe(true);
      expect(range.satisfiedBy('1.0.0')).toBe(true);
      expect(range.satisfiedBy('2.0.1')).toBe(false);
      expect(range.satisfiedBy('3.0.0')).toBe(false);
    });

    it('should combine >= and <= for a closed range', () => {
      const range = new Range('>=1.0.0 <=2.0.0');
      expect(range.satisfiedBy('1.0.0')).toBe(true);
      expect(range.satisfiedBy('1.5.0')).toBe(true);
      expect(range.satisfiedBy('2.0.0')).toBe(true);
      expect(range.satisfiedBy('0.9.9')).toBe(false);
      expect(range.satisfiedBy('2.0.1')).toBe(false);
    });
  });

  describe('getSpec() method', () => {
    it('should return original range specification string', () => {
      expect(new Range('^1.2.3').getSpec()).toBe('^1.2.3');
      expect(new Range('~1.2.3').getSpec()).toBe('~1.2.3');
      expect(new Range('>=1.0.0 <2.0.0').getSpec()).toBe('>=1.0.0 <2.0.0');
      expect(new Range('*').getSpec()).toBe('*');
      expect(new Range('latest').getSpec()).toBe('latest');
    });

    it('should preserve 4d keyword as spec', () => {
      const ide = new Version('21.0.0');
      expect(new Range('4d', ide).getSpec()).toBe('4d');
    });
  });

  describe('intersect() method', () => {
    it('should return a new Range for overlapping ranges', () => {
      const r1 = new Range('>=1.0.0 <3.0.0');
      const r2 = new Range('>=2.0.0 <4.0.0');
      const intersection = r1.intersect(r2);
      expect(intersection).not.toBeNull();
      expect(intersection!.satisfiedBy('2.0.0')).toBe(true);
      expect(intersection!.satisfiedBy('2.9.9')).toBe(true);
      expect(intersection!.satisfiedBy('1.0.0')).toBe(false);
      expect(intersection!.satisfiedBy('3.0.0')).toBe(false);
    });

    it('should return null for non-overlapping ranges', () => {
      const r1 = new Range('^1.0.0');
      const r2 = new Range('^2.0.0');
      expect(r1.intersect(r2)).toBeNull();
    });

    it('intersection of identical ranges should satisfy same versions', () => {
      const r1 = new Range('^1.2.0');
      const r2 = new Range('^1.2.0');
      const intersection = r1.intersect(r2);
      expect(intersection).not.toBeNull();
      expect(intersection!.satisfiedBy('1.2.5')).toBe(true);
      expect(intersection!.satisfiedBy('2.0.0')).toBe(false);
    });
  });

  describe('Range.parse() static method', () => {
    it('should return a Range instance for valid spec', () => {
      const r = Range.parse('^1.2.3');
      expect(r).not.toBeNull();
      expect(r!.satisfiedBy('1.2.3')).toBe(true);
      expect(r!.satisfiedBy('2.0.0')).toBe(false);
    });

    it('should return null for invalid spec instead of throwing', () => {
      expect(Range.parse('not a valid range !@#')).toBeNull();
    });

    it('should forward ideVersion to constructor', () => {
      const ide = new Version('21.0.0');
      const r = Range.parse('4d', ide);
      expect(r).not.toBeNull();
      expect(r!.satisfiedBy('21.5.0')).toBe(true);
      expect(r!.satisfiedBy('22.0.0')).toBe(false);
    });
  });

  describe('Range.isValid() static method', () => {
    it('should return true for valid range specs', () => {
      expect(Range.isValid('^1.2.3')).toBe(true);
      expect(Range.isValid('~1.0.0')).toBe(true);
      expect(Range.isValid('>=1.0.0 <2.0.0')).toBe(true);
      expect(Range.isValid('*')).toBe(true);
      expect(Range.isValid('latest')).toBe(true);
      expect(Range.isValid('1.2.3')).toBe(true);
    });

    it('should return false for invalid range specs', () => {
      expect(Range.isValid('not a valid range !@#')).toBe(false);
    });
  });

  describe('Range.satisfies() static helper', () => {
    it('should check if version satisfies range spec', () => {
      expect(Range.satisfies('1.2.3', '^1.0.0')).toBe(true);
      expect(Range.satisfies('2.0.0', '^1.0.0')).toBe(false);
      expect(Range.satisfies('1.0.0', '>=1.0.0 <2.0.0')).toBe(true);
      expect(Range.satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
    });

    it('should support 4d keyword with ideVersion', () => {
      const ide = new Version('21.0.0');
      expect(Range.satisfies('21.3.0', '4d', ide)).toBe(true);
      expect(Range.satisfies('22.0.0', '4d', ide)).toBe(false);
    });
  });

  describe('Range.maxSatisfying() static helper', () => {
    it('should find max satisfying version from a list', () => {
      const versions = ['1.0.0', '1.2.0', '1.5.0', '2.0.0'];
      expect(Range.maxSatisfying(versions, '^1.0.0')).toBe('1.5.0');
    });

    it('should return null if nothing satisfies', () => {
      expect(Range.maxSatisfying(['1.0.0', '1.5.0'], '^2.0.0')).toBeNull();
    });
  });

  describe('Range.minSatisfying() static helper', () => {
    it('should find min satisfying version from a list', () => {
      const versions = ['1.0.0', '1.2.0', '1.5.0', '2.0.0'];
      expect(Range.minSatisfying(versions, '^1.0.0')).toBe('1.0.0');
    });

    it('should return null if nothing satisfies', () => {
      expect(Range.minSatisfying(['1.0.0', '1.5.0'], '^2.0.0')).toBeNull();
    });
  });
});
