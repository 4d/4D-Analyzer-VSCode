import { GitHubRelease } from '../types';

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
