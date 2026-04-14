import { GitHubRelease, GitLabRelease, GitLabAssetLink } from '../types';
import { Fetcher, FetchError } from './Fetcher';

/**
 * GitLab API v4 client implementing the Fetcher interface.
 * Uses plain fetch — no external dependency.
 *
 * Supports gitlab.com and private instances via the `host` parameter.
 * Auth uses PRIVATE-TOKEN header; token is stripped when downloading
 * from a URL that does not match the host (security: prevent token leakage).
 */
export class GitlabFetcher implements Fetcher {
    private token?: string;
    private host: string;
    private apiURL: string;

    constructor(token?: string, host?: string) {
        this.token = token;
        this.host = (host || 'https://gitlab.com').replace(/\/+$/, '');
        this.apiURL = `${this.host}/api/v4`;
    }

    /**
     * Encode a GitLab project path for use in API URLs.
     * "group/project" → "group%2Fproject"
     * "group/subgroup/project" → "group%2Fsubgroup%2Fproject"
     */
    private encodeProjectPath(owner: string, repo: string): string {
        const fullPath = repo ? `${owner}/${repo}` : owner;
        return encodeURIComponent(fullPath);
    }

    /**
     * Build auth headers (only when token is available).
     */
    private authHeaders(): Record<string, string> {
        if (this.token) {
            return { 'PRIVATE-TOKEN': this.token };
        }
        return {};
    }

    /**
     * Build auth headers only if the URL belongs to the configured host.
     * Prevents leaking the token to external CDN/S3 hosts.
     */
    private authHeadersForURL(url: string): Record<string, string> {
        if (this.token && url.startsWith(this.host)) {
            return { 'PRIVATE-TOKEN': this.token };
        }
        return {};
    }

    /**
     * Perform a GET request against the GitLab API.
     */
    private async apiGet<T>(endpoint: string): Promise<T> {
        const url = `${this.apiURL}${endpoint}`;
        const response = await fetch(url, {
            headers: { ...this.authHeaders(), 'Accept': 'application/json' },
        });
        if (!response.ok) {
            throw new FetchError(
                `GitLab API error ${response.status}: ${response.statusText} (${url})`,
                { status: response.status, url }
            );
        }
        return response.json() as Promise<T>;
    }

    /**
     * Convert a GitLabRelease to the GitHubRelease shape expected by the Fetcher interface.
     */
    private toGitHubRelease(gl: GitLabRelease): GitHubRelease {
        return {
            id: 0,
            tag_name: gl.tag_name,
            name: gl.name ?? gl.tag_name,
            draft: false, // GitLab releases have no draft concept
            prerelease: gl.upcoming_release ?? false,
            created_at: gl.created_at,
            published_at: gl.released_at ?? gl.created_at,
            html_url: '',
            zipball_url: '',
            tarball_url: '',
            assets: (gl.assets?.links ?? []).map((link: GitLabAssetLink) => ({
                id: 0,
                name: link.name,
                size: 0,
                browser_download_url: link.direct_asset_url || link.url,
                url: link.url,
            })),
        };
    }

    /**
     * GitLab has no simple rate-limit-remaining endpoint.
     * Return Infinity so callers never throttle on our behalf.
     */
    async rateLimit(): Promise<number> {
        return Infinity;
    }

    /**
     * Get latest release (first one from the API, which returns newest first).
     */
    async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease> {
        const encoded = this.encodeProjectPath(owner, repo);
        const releases = await this.apiGet<GitLabRelease[]>(
            `/projects/${encoded}/releases?per_page=1`
        );
        if (!releases || releases.length === 0) {
            const label = this.host !== 'https://gitlab.com' ? `GitLab (${this.host})` : 'GitLab';
            throw new FetchError(
                `Unable to find the latest release for ${owner}/${repo} on ${label}`,
                { url: `${this.apiURL}/projects/${encoded}/releases` }
            );
        }
        return this.toGitHubRelease(releases[0]);
    }

    /**
     * Get all releases (paginated, up to 5000).
     */
    async getReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
        const encoded = this.encodeProjectPath(owner, repo);
        const allReleases: GitHubRelease[] = [];
        let page = 1;
        const perPage = 100;
        const maxPages = 50;

        while (page <= maxPages) {
            const releases = await this.apiGet<GitLabRelease[]>(
                `/projects/${encoded}/releases?per_page=${perPage}&page=${page}`
            );

            allReleases.push(...releases.map(r => this.toGitHubRelease(r)));

            if (releases.length < perPage) {
                break;
            }
            page++;
        }

        return allReleases;
    }

    /**
     * Download a release asset for a given tag.
     *
     * Strategy:
     * 1. Get the release by tag
     * 2. Look for a .zip asset in release links
     * 3. If no link found, fall back to the source archive URL
     */
    async downloadReleaseAsset(owner: string, repo: string, tag: string): Promise<ArrayBuffer> {
        const encoded = this.encodeProjectPath(owner, repo);

        // Get the specific release by tag
        const release = await this.apiGet<GitLabRelease>(
            `/projects/${encoded}/releases/${encodeURIComponent(tag)}`
        );

        // Try to find a .zip asset link
        const zipLink = this.findZipAssetLink(release, repo);

        let downloadURL: string;
        if (zipLink) {
            downloadURL = zipLink;
        } else {
            // Fall back to source archive
            downloadURL = `${this.apiURL}/projects/${encoded}/repository/archive.zip?sha=${encodeURIComponent(tag)}`;
        }

        const response = await fetch(downloadURL, {
            headers: this.authHeadersForURL(downloadURL),
        });

        if (!response.ok) {
            throw new FetchError(
                `Unable to download release asset from ${downloadURL}: ${response.status} ${response.statusText}`,
                { status: response.status, url: downloadURL }
            );
        }

        return response.arrayBuffer();
    }

    /**
     * Find a .zip asset link from a GitLab release.
     * Matches links whose name ends in .zip, preferring links that contain the project name.
     */
    private findZipAssetLink(release: GitLabRelease, projectName: string): string | null {
        const links = release.assets?.links;
        if (!links?.length) {
            return null;
        }

        // First pass: look for a .zip link whose name contains the project name
        for (const link of links) {
            const name = link.name.toLowerCase();
            if (name.endsWith('.zip') && name.includes(projectName.toLowerCase())) {
                return link.direct_asset_url || link.url;
            }
        }

        // Second pass: any .zip link
        for (const link of links) {
            if (link.name.toLowerCase().endsWith('.zip')) {
                return link.direct_asset_url || link.url;
            }
        }

        return null;
    }

    /**
     * Get the configured host URL.
     */
    getHost(): string {
        return this.host;
    }
}
