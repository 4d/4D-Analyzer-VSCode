import * as semver from 'semver';
import { VersionInfo } from '../types';

/**
 * Version class for parsing and comparing semantic versions
 * Supports standard semver and 4D-specific R-Release formats
 */
export class Version {
  private semver: semver.SemVer;
  public isR: boolean = false;
  public isMain: boolean = false;
  public raw: string;

  constructor(versionString: string) {

    //No version means main
    if (versionString === "0") {
      versionString = "0.0.0";
      this.isMain = true;
    }
    this.raw = versionString;

    // Clean version string (remove 'v' prefix)
    let clean = versionString.replace(/^v/, '');

    // Handle 4D R-Release formats (2-digit year)
    if (/^\d{2}R\d+$/.test(clean)) {
      // 20R2 → 20.2.0
      clean = clean.replace(/R/, '.') + '.0';
      this.isR = true;
    } else if (/^\d{2}\.R\d+(\.\d+)?$/.test(clean)) {
      // 20.R2.3 → 20.2.3 or 20.R2 → 20.2.0
      clean = clean.replace(/\.R/, '.');
      if (!/\.\d+\.\d+$/.test(clean)) {
        clean += '.0';
      }
      this.isR = true;
    }

    // Parse with semver
    const parsed = semver.parse(clean);
    if (!parsed) {
      throw new Error(`Invalid version: ${versionString}`);
    }
    this.semver = parsed;
    this.isMain = this.semver.major == 0;
  }

  /**
   * Get major version number
   */
  get major(): number {
    return this.semver.major;
  }

  /**
   * Get minor version number
   */
  get minor(): number {
    return this.semver.minor;
  }

  /**
   * Get patch version number
   */
  get patch(): number {
    return this.semver.patch;
  }

  /**
   * Get prerelease identifiers
   */
  get prerelease(): readonly (string | number)[] {
    return this.semver.prerelease;
  }

  /**
   * Get build metadata
   */
  get build(): readonly string[] {
    return this.semver.build;
  }

  /**
   * Check if this version is greater than another
   */
  gt(other: Version): boolean {
    return semver.gt(this.semver, other.semver);
  }

  /**
   * Check if this version is greater than or equal to another
   */
  gte(other: Version): boolean {
    return semver.gte(this.semver, other.semver);
  }

  /**
   * Check if this version is less than another
   */
  lt(other: Version): boolean {
    return semver.lt(this.semver, other.semver);
  }

  /**
   * Check if this version is less than or equal to another
   */
  lte(other: Version): boolean {
    return semver.lte(this.semver, other.semver);
  }

  /**
   * Check if this version equals another
   */
  eq(other: Version): boolean {
    return semver.eq(this.semver, other.semver);
  }

  /**
   * Compare with another version
   * @returns 0 if equal, 1 if greater, -1 if less
   */
  compare(other: Version): number {
    return semver.compare(this.semver, other.semver);
  }

  /**
   * Convert to standard semver string
   */
  toString(): string {
    return this.semver.version;
  }

  /**
   * Convert to 4D IDE version string (e.g., "21.2")
   */
  toIDEString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }

  /**
   * Convert to semantic string with all components
   */
  toSemanticString(): string {
    let result = `${this.major}.${this.minor}.${this.patch}`;
    if (this.prerelease.length > 0) {
      result += '-' + this.prerelease.join('.');
    }
    if (this.build.length > 0) {
      result += '+' + this.build.join('.');
    }
    return result;
  }

  /**
   * Get version info object
   */
  toInfo(): VersionInfo {
    return {
      major: this.major,
      minor: this.minor,
      patch: this.patch,
      prerelease: this.prerelease.map(String),
      build: this.build.slice(),
      isR: this.isR,
      raw: this.raw
    };
  }

  /**
   * Static factory method
   */
  static parse(versionString: string): Version | null {
    try {
      return new Version(versionString);
    } catch {
      return null;
    }
  }

  /**
   * Check if a string is a valid version
   */
  static isValid(versionString: string): boolean {
    return Version.parse(versionString) !== null;
  }
}