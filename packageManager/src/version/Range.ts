import * as semver from 'semver';
import { Version } from './Version';

/**
 * Range class for semantic version range matching
 * Supports npm semver range syntax and 4D-specific keywords
 */
export class Range {
  private range: semver.Range;
  private rangeSpec: string;
  // null = neutral (wildcard/latest — matches both R and LTS)
  private isRRange: boolean | null = null;

  /**
   * Normalize R-release notation in a range spec to plain semver.
   * e.g. '^20R2.3' → '^20.2.3',  '20R2.*' → '20.2.x',  '20R2' → '20.2.0'
   */
  private static normalizeRSpec(spec: string): string {
    return spec
      .replace(/(\d+)\.R(\d+)\.(\d+)/g, '$1.$2.$3')  // 20.R2.3 → 20.2.3
      .replace(/(\d+)\.R(\d+)/g,          '$1.$2.0')   // 20.R2   → 20.2.0
      .replace(/(\d+)R(\d+)\.(\d+)/g,     '$1.$2.$3')  // 20R2.3  → 20.2.3
      .replace(/(\d+)R(\d+)\.\*/g,        '$1.$2.x')   // 20R2.*  → 20.2.x
      .replace(/(\d+)R(\d+)/g,            '$1.$2.0');  // 20R2    → 20.2.0
  }

  constructor(rangeSpec: string, ideVersion?: Version) {
    this.rangeSpec = rangeSpec;

    // Handle special keywords
    if (rangeSpec === 'latest' || rangeSpec === '*' || !rangeSpec) {
      this.range = new semver.Range('*');
      this.isRRange = null; // neutral
    } else if (rangeSpec.toLowerCase() === '4d') {
      // Match IDE version — type follows the IDE's type
      const version = ideVersion?.toIDEString();
      this.range = new semver.Range(`^${version}`);
      this.isRRange = ideVersion?.isR ?? null;
    } else {
      // Detect R-release notation before normalizing
      this.isRRange = /\d+\.?R\d+/.test(rangeSpec);
      // Parse as semver range (normalize R notation first if needed)
      const normalizedSpec = this.isRRange ? Range.normalizeRSpec(rangeSpec) : rangeSpec;
      this.range = new semver.Range(normalizedSpec);
    }
  }

  /**
   * Check if a version satisfies this range.
   * Mirrors 4D semantics: R-release and LTS are separate tracks within the same
   * major; a typed range (R or LTS) rejects versions from the other track.
   * Neutral ranges (*, latest, empty) match both.
   */
  satisfiedBy(version: string | Version): boolean {
    const v = version instanceof Version ? version : Version.parse(version);
    if (!v) return false;

    // Type-compatibility guard
    if (this.isRRange !== null && v.isR !== this.isRRange) {
      return false;
    }

    return semver.satisfies(v.toString(), this.range);
  }

  /**
   * Find the maximum version that satisfies this range
   */
  maxSatisfying(versions: string[]): string | null {
    const filtered = this.isRRange !== null
      ? versions.filter(v => {
          const parsed = Version.parse(v);
          return parsed ? parsed.isR === this.isRRange : true;
        })
      : versions;
    // Normalize each version string to semver, keeping a map back to original
    const normalized = filtered.map(v => (Version.parse(v)?.toString() ?? v.replace(/^v/, '')));
    const result = semver.maxSatisfying(normalized, this.range);
    if (!result) {
      return null;
    }
    const idx = normalized.indexOf(result);
    return idx >= 0 ? filtered[idx] : result;
  }

  /**
   * Find the minimum version that satisfies this range
   */
  minSatisfying(versions: string[]): string | null {
    const filtered = this.isRRange !== null
      ? versions.filter(v => {
          const parsed = Version.parse(v);
          return parsed ? parsed.isR === this.isRRange : true;
        })
      : versions;
    const normalized = filtered.map(v => (Version.parse(v)?.toString() ?? v.replace(/^v/, '')));
    const result = semver.minSatisfying(normalized, this.range);
    if (!result) {
      return null;
    }
    const idx = normalized.indexOf(result);
    return idx >= 0 ? filtered[idx] : result;
  }

  /**
   * Filter versions that satisfy this range
   */
  filter(versions: string[]): string[] {
    return versions.filter(v => this.satisfiedBy(v));
  }

  /**
   * Check if this range intersects with another range
   */
  intersects(other: Range): boolean {
    return semver.intersects(this.range, other.range);
  }

  /**
   * Get the intersection of this range with another
   * Returns a new Range representing the intersection, or null if no intersection
   */
  intersect(other: Range): Range | null {
    if (!this.intersects(other)) {
      return null;
    }

    // Create a combined range (AND operation)
    // This is a simplified approach - proper intersection is complex
    const combinedSpec = `${this.rangeSpec} ${other.rangeSpec}`;

    try {
      return new Range(combinedSpec);
    } catch {
      return null;
    }
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    return this.range.raw;
  }

  /**
   * Get the original range specification
   */
  getSpec(): string {
    return this.rangeSpec;
  }



  /**
   * Static factory method
   */
  static parse(rangeSpec: string, ideVersion?: Version): Range | null {
    try {
      return new Range(rangeSpec, ideVersion);
    } catch {
      return null;
    }
  }

  /**
   * Check if a range specification is valid
   */
  static isValid(rangeSpec: string): boolean {
    return Range.parse(rangeSpec) !== null;
  }

  /**
   * Check if a version satisfies a range (static helper)
   */
  static satisfies(version: string, rangeSpec: string, ideVersion?: Version): boolean {
    const range = new Range(rangeSpec, ideVersion);
    return range.satisfiedBy(version);
  }

  /**
   * Find max satisfying version (static helper)
   */
  static maxSatisfying(versions: string[], rangeSpec: string, ideVersion?: Version): string | null {
    const range = new Range(rangeSpec, ideVersion);
    return range.maxSatisfying(versions);
  }

  /**
   * Find min satisfying version (static helper)
   */
  static minSatisfying(versions: string[], rangeSpec: string, ideVersion?: Version): string | null {
    const range = new Range(rangeSpec, ideVersion);
    return range.minSatisfying(versions);
  }
}