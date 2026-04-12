import { GitHubRelease } from '../types';

/**
 * Error class for fetch operations that carries HTTP status and URL context
 */
export class FetchError extends Error {
  status?: number;
  url?: string;

  constructor(message: string, options?: { status?: number; url?: string }) {
    super(message);
    this.name = 'FetchError';
    this.status = options?.status;
    this.url = options?.url;
  }
}

/**
 * Interface for fetching dependency information from various sources
 */
export interface Fetcher {
  /**
   * Get remaining rate limit
   */
  rateLimit(): Promise<number>;

  /**
   * Get latest release for a repository
   */
  getLatestRelease(owner: string, repo: string): Promise<GitHubRelease>;

  /**
   * Get all releases for a repository
   */
  getReleases(owner: string, repo: string): Promise<GitHubRelease[]>;

  downloadReleaseAsset(owner: string, repo: string, tag: string): Promise<ArrayBuffer>;
}
