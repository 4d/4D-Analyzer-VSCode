export interface DependencyFetcherOptions {
  /**
   * GitHub personal access token for authentication
   */
  auth?: string;
}

export interface PackageDependencies {
  /**
   * Production dependencies
   */
  dependencies?: Record<string, string>;

  /**
   * Development dependencies
   */
  devDependencies?: Record<string, string>;

  /**
   * Peer dependencies
   */
  peerDependencies?: Record<string, string>;

  /**
   * Optional dependencies
   */
  optionalDependencies?: Record<string, string>;
}

export interface RepositoryInfo {
  owner: string;
  repo: string;
  ref?: string;
}

/**
 * Options for PackageManager construction
 */
export interface PackageManagerOptions {
  /** IDE version string (e.g. "21.2.0") */
  ideVersion: string;
  /** GitHub personal access token for authentication */
  authToken?: string;
  /** Custom cache folder path (absolute). Defaults to platform-specific location */
  cacheFolder?: string;
  /**
   * Full absolute path to the user preferences folder.
   * Falls back to `<projectPath>/userPreferences.<os-username>/` when omitted.
   */
  preferencesFolder?: string;
  /** Callback invoked with the dependency name when a fetch starts */
  callback?: (message: string) => void;
  /** Custom fetcher implementation. Defaults to GithubFetcher */
  fetcher?: Fetcher;
}

import type { Fetcher } from './dependency/Fetcher';

export interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string[];
  build?: string[];
  isR: boolean;
  raw: string;
}

export interface DependenciesFile {
  version: number; // 2100
  dependencies: Record<string, DependencySpec>;
}

/**
 * Dependency specification from dependencies.json
 */
export interface DependencySpec {
  github?: string; // "owner/repository"
  version?: string; // Version range or "latest" | "4d"
  tag?: string; // Specific tag (overrides version)
  path?: string; // Local path (alternative to github)
}

/**
 * environment4d.json structure
 */
export interface EnvironmentFile {
  dependencies?: Record<string, string | DependencySpec>;
  devDependencies?: Record<string, DependencySpec>;
  github?: GitHubConfig;
  fetch?: FetchConfig;
  update?: UpdateConfig;
  trace?: boolean;
  debug?: boolean;
}

/**
 * GitHub configuration
 */
export interface GitHubConfig {
  token?: string;
  htmlURL?: string; // Default: "https://github.com/"
  apiURL?: string; // Default: "https://api.github.com/"
}

/**
 * Fetch configuration
 */
export interface FetchConfig {
  timeout?: number; // Default: 10 (seconds)
  maxRetryCount?: number; // Default: 3
  retryDelay?: number; // Default: 3 (seconds)
  parallel?: boolean; // Default: true
  parallelCount?: number; // Default: 0 (cores-1)
  maxRecursivePass?: number; // Default: 1000
}

/**
 * Update configuration
 */
export interface UpdateConfig {
  maxCount?: number; // Default: 1
  delays?: Record<string, any>;
}

/**
 * Metadata stored alongside cached dependencies
 */
export interface DependencyMetadata {
  name: string;
  github: string;
  tag: string;
  fetchedAt: string;
  archiveSize: number;
}

/**
 * Lock file structure (dependencies-lock.json)
 */
export interface LockFile {
  version: number; // 2120
  dependencies: Record<string, LockEntry>;
}


/**
 * Error/Warning message structure
 */
export interface ErrorMessage {
  message: string;
  dependency?: string;
}

/**
 * Lock file entry for a single dependency
 */
export interface LockEntry {
  github?: string;
  tag?: string;
  version?: string;
  path?: string;
  htmlURL?: string;
  archiveURL?: string;
  archiveSize?: number;
  ETag?: string;
  dependencies?: Record<string, DependencySpec>;
  loaded?: boolean;
  found?: boolean;
  wanted?: string;
  wantedInCache?: boolean;
  outdated?: boolean;
  current?: string;
  tryCount?: number;
  conflict?: boolean;
  message?: string;
  versions?: string[];
  tags?: string[];
  isPrimary?: boolean;
  update?: {
    errors?: ErrorMessage[];
    warnings?: ErrorMessage[];
  };
}

/**
 * User preferences (dependencies-pref.json)
 */
export interface UserPreferences {
  update?: boolean;
}


/**
 * Environment context for fetching
 */
export interface Environment {
  cacheFolder: string;
  github: GitHubConfig;
  fetch: FetchConfig;
  update: UpdateConfig;
  trace: boolean;
  debug: boolean;
  dependencies: Record<string, string | DependencySpec>;
  devDependencies: Record<string, DependencySpec>;
}

/**
 * GitHub Release object
 */
export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  html_url: string;
  zipball_url: string;
  tarball_url: string;
  assets: GitHubAsset[];
}

/**
 * GitHub Release Asset
 */
export interface GitHubAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  url: string;
}

/**
 * Fetch options
 */
export interface FetchOptions {
  update?: boolean;
  filter?: string[] | null;
}

/**
 * Fetch result
 */
export interface FetchResult {
  success: boolean;
  lock: LockFile;
  errors: ErrorMessage[];
  warnings: ErrorMessage[];
  fetchedCount: number;
  skippedCount: number;
}