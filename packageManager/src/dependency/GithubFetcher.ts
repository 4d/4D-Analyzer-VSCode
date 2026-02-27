import { Octokit } from '@octokit/rest';
import {
    GitHubRelease
} from '../types';
import { Fetcher } from './Fetcher';

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
        const response = await this.octokit.repos.getLatestRelease({
            owner,
            repo
        });
        return response.data as GitHubRelease;
    }

    /**
     * Get all releases for a repository
     */
    async getReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
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
    }

    async downloadReleaseAsset(owner: string, repo: string, tag: string): Promise<ArrayBuffer> {
        const release = await this.octokit.repos.getReleaseByTag({
            owner,
            repo,
            tag
        });

        if (!release.data.assets || release.data.assets.length === 0) {
            throw new Error(`No assets found for release ${tag}`);
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
    }

}

