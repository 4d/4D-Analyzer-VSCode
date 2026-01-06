import * as semver from 'semver';
import { Version } from './Version';

/**
 * Range class for semantic version range matching
 * Supports npm semver range syntax and 4D-specific keywords
 */
export class Range {
  private range: semver.Range;
  private rangeSpec: string;

  constructor(rangeSpec: string, ideVersion?: string) {
    this.rangeSpec = rangeSpec;

    // Handle special keywords
    if (rangeSpec === 'latest' || rangeSpec === '*' || !rangeSpec) {
      this.range = new semver.Range('*');
    } else if (rangeSpec.toLowerCase() === '4d') {
      // Match IDE version
      const version = ideVersion || this.getIDEVersion();
      this.range = new semver.Range(`^${version}`);
    } else {
      // Parse as semver range
      this.range = new semver.Range(rangeSpec);
    }
  }

  /**
   * Check if a version satisfies this range
   */
  satisfiedBy(version: string | Version): boolean {
    const versionString = version instanceof Version
      ? version.toString()
      : version.replace(/^v/, '');

    return semver.satisfies(versionString, this.range);
  }

  /**
   * Find the maximum version that satisfies this range
   */
  maxSatisfying(versions: string[]): string | null {
    const cleanVersions = versions.map(v => v.replace(/^v/, ''));
    const result = semver.maxSatisfying(cleanVersions, this.range);

    if (!result) {
      return null;
    }

    // Return with original 'v' prefix if it existed
    const originalVersion = versions.find(v =>
      v.replace(/^v/, '') === result
    );
    return originalVersion || result;
  }

  /**
   * Find the minimum version that satisfies this range
   */
  minSatisfying(versions: string[]): string | null {
    const cleanVersions = versions.map(v => v.replace(/^v/, ''));
    const result = semver.minSatisfying(cleanVersions, this.range);

    if (!result) {
      return null;
    }

    // Return with original 'v' prefix if it existed
    const originalVersion = versions.find(v =>
      v.replace(/^v/, '') === result
    );
    return originalVersion || result;
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
   * Get IDE version from environment or use default
   */
  private getIDEVersion(): string {
    // Check environment variable
    if (process.env.IDE_VERSION) {
      return process.env.IDE_VERSION;
    }

    // Default to 21.2.0 (2-digit year format)
    return '21.2.0';
  }

  /**
   * Static factory method
   */
  static parse(rangeSpec: string, ideVersion?: string): Range | null {
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
  static satisfies(version: string, rangeSpec: string, ideVersion?: string): boolean {
    const range = new Range(rangeSpec, ideVersion);
    return range.satisfiedBy(version);
  }

  /**
   * Find max satisfying version (static helper)
   */
  static maxSatisfying(versions: string[], rangeSpec: string, ideVersion?: string): string | null {
    const range = new Range(rangeSpec, ideVersion);
    return range.maxSatisfying(versions);
  }

  /**
   * Find min satisfying version (static helper)
   */
  static minSatisfying(versions: string[], rangeSpec: string, ideVersion?: string): string | null {
    const range = new Range(rangeSpec, ideVersion);
    return range.minSatisfying(versions);
  }
}