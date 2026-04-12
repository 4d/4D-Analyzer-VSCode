import { VersionInfo } from '../types';

// Regex: MAJOR.MINOR.PATCH[-prerelease][+build]
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*))?(?:\+([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*))?$/;

/**
 * Version class for parsing and comparing semantic versions
 * Supports standard semver and 4D-specific R-Release formats
 */
export class Version {
  private _major: number;
  private _minor: number;
  private _patch: number;
  private _prerelease: readonly (string | number)[];
  private _build: readonly string[];
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
    } else if (/^\d{2}R\d+\.\d+$/.test(clean)) {
      // 20R2.1 → 20.2.1
      clean = clean.replace(/R/, '.');
      this.isR = true;
    } else if (/^\d{2}\.R\d+(\.\d+)?$/.test(clean)) {
      // 20.R2.3 → 20.2.3 or 20.R2 → 20.2.0
      clean = clean.replace(/\.R/, '.');
      if (!/\.\d+\.\d+$/.test(clean)) {
        clean += '.0';
      }
      this.isR = true;
    }

    const m = SEMVER_RE.exec(clean);
    if (!m) {
      throw new Error(`Invalid version: ${versionString}`);
    }
    this._major = Number(m[1]);
    this._minor = Number(m[2]);
    this._patch = Number(m[3]);
    this._prerelease = m[4]
      ? m[4].split('.').map(id => /^\d+$/.test(id) ? Number(id) : id)
      : [];
    this._build = m[5] ? m[5].split('.') : [];
    this.isMain = this._major === 0;
  }

  get major(): number {
    return this._major;
  }

  get minor(): number {
    return this._minor;
  }

  get patch(): number {
    return this._patch;
  }

  get prerelease(): readonly (string | number)[] {
    return this._prerelease;
  }

  get build(): readonly string[] {
    return this._build;
  }

  /**
   * Check if this version is greater than another
   */
  gt(other: Version): boolean {
    return this.compare(other) > 0;
  }

  /**
   * Check if this version is greater than or equal to another
   */
  gte(other: Version): boolean {
    return this.compare(other) >= 0;
  }

  /**
   * Check if this version is less than another
   */
  lt(other: Version): boolean {
    return this.compare(other) < 0;
  }

  /**
   * Check if this version is less than or equal to another
   */
  lte(other: Version): boolean {
    return this.compare(other) <= 0;
  }

  /**
   * Check if this version equals another
   */
  eq(other: Version): boolean {
    return this.compare(other) === 0;
  }

  /**
   * Compare with another version, mirroring 4D's Version.compareTo() logic:
   * - compare major first
   * - within same major: R-release > LTS (regardless of minor number)
   * - then compare minor, patch, prerelease
   * @returns 0 if equal, 1 if greater, -1 if less
   */
  compare(other: Version): number {
    if (this.major > other.major) return 1;
    if (this.major < other.major) return -1;

    // Same major: R-release beats LTS unconditionally
    if (this.isR && !other.isR) return 1;
    if (!this.isR && other.isR) return -1;

    if (this.minor > other.minor) return 1;
    if (this.minor < other.minor) return -1;

    if (this.patch > other.patch) return 1;
    if (this.patch < other.patch) return -1;

    // Prerelease is lower precedence than release
    const thisPre = this.prerelease.length > 0;
    const otherPre = other.prerelease.length > 0;
    if (thisPre && !otherPre) return -1;
    if (!thisPre && otherPre) return 1;
    if (thisPre && otherPre) {
      return Version.comparePrerelease(this.prerelease, other.prerelease);
    }

    return 0;
  }

  /**
   * Compare two prerelease identifier arrays per semver §11:
   * - numeric ids are compared as integers
   * - string ids are compared lexically (ASCII)
   * - numeric < string
   * - fewer fields < more fields when all preceding are equal
   */
  private static comparePrerelease(
    a: readonly (string | number)[],
    b: readonly (string | number)[]
  ): number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const ai = a[i];
      const bi = b[i];
      if (ai === bi) continue;

      const aNum = typeof ai === 'number';
      const bNum = typeof bi === 'number';

      // numeric < string
      if (aNum && !bNum) return -1;
      if (!aNum && bNum) return 1;

      // both numeric
      if (aNum && bNum) return (ai as number) < (bi as number) ? -1 : 1;

      // both string
      return (ai as string) < (bi as string) ? -1 : 1;
    }
    // all equal so far — more identifiers = higher precedence
    return a.length - b.length;
  }

  /**
   * Convert to standard semver string
   */
  toString(): string {
    let result = `${this._major}.${this._minor}.${this._patch}`;
    if (this._prerelease.length > 0) {
      result += '-' + this._prerelease.join('.');
    }
    return result;
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