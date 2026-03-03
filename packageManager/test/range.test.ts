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
});
