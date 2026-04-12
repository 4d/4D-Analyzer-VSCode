import { Octokit } from '@octokit/rest';
import {
    GitHubRelease
} from '../types';
import { Fetcher, FetchError } from './Fetcher';

export class GithubFetcher implements Fetcher {
    private octokit: Octokit;

    constructor(authToken?: string) {
        this.octokit = new Octokit({ auth: authToken });
    }

    async rateLimit(): Promise<number> {
        const response = await this.octokit.rateLimit.get();
        return response.data.rate.remaining;
    }

    /**
     * Get latest release for a repository
     */
    async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease> {
        try {
            const response = await this.octokit.repos.getLatestRelease({
                owner,
                repo
            });
            return response.data as GitHubRelease;
        } catch (error: any) {
            const status = error.status ?? error.response?.status;
            const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
            if (status === 404) {
                throw new FetchError(`Unable to find the latest release for ${owner}/${repo} on GitHub`, { status, url });
            }
            if (status === 403) {
                throw new FetchError(`GitHub API rate limit exceeded or access denied for ${owner}/${repo}`, { status, url });
            }
            throw new FetchError(
                `GitHub API error when fetching latest release for ${owner}/${repo}: ${error.message}`,
                { status, url }
            );
        }
    }

    /**
     * Get all releases for a repository
     */
    async getReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
        try {
            const releases: GitHubRelease[] = [];
            let page = 1;
            const perPage = 100;
            const maxPages = 50;

            while (page <= maxPages) {
                const response = await this.octokit.repos.listReleases({
                    owner,
                    repo,
                    per_page: perPage,
                    page
                });

                releases.push(...(response.data as GitHubRelease[]));

                if (response.data.length < perPage) {
                    break; // No more pages
                }

                page++;
            }

            return releases;
        } catch (error: any) {
            const status = error.status ?? error.response?.status;
            const url = `https://api.github.com/repos/${owner}/${repo}/releases`;
            if (status === 404) {
                throw new FetchError(`GitHub does not return any data when requesting releases for ${owner}/${repo}`, { status, url });
            }
            throw new FetchError(
                `GitHub API error when fetching releases for ${owner}/${repo}: ${error.message}`,
                { status, url }
            );
        }
    }

    async downloadReleaseAsset(owner: string, repo: string, tag: string): Promise<ArrayBuffer> {
        let releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
        try {
            const release = await this.octokit.repos.getReleaseByTag({
                owner,
                repo,
                tag
            });

            if (!release.data.assets || release.data.assets.length === 0) {
                throw new FetchError(
                    `Unable to find any release asset for GitHub repository ${owner}/${repo} at tag ${tag}`,
                    { url: releaseUrl }
                );
            }

            const assetId = release.data.assets[0].id;

            const response = await this.octokit.rest.repos.getReleaseAsset({
                owner,
                repo,
                asset_id: assetId,
                headers: {
                    accept: 'application/octet-stream'
                }
            });
            const data = response.data as unknown as ArrayBuffer;
            return data;
        } catch (error: any) {
            if (error instanceof FetchError) {
                throw error;
            }
            const status = error.status ?? error.response?.status;
            if (status === 404) {
                throw new FetchError(
                    `Unable to find release '${tag}' for ${owner}/${repo} on GitHub`,
                    { status, url: releaseUrl }
                );
            }
            throw new FetchError(
                `Unable to download release asset from ${releaseUrl}: ${error.message}`,
                { status, url: releaseUrl }
            );
        }
    }

}

