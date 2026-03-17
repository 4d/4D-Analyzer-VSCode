import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitlabFetcher } from '../src/dependency/GitlabFetcher';

describe('GitlabFetcher', () => {

  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /**
   * Helper to create a mock fetch that returns the given JSON for any request.
   */
  function mockFetchJson(data: any, status = 200): void {
    global.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
    });
  }

  describe('constructor', () => {
    it('should default to gitlab.com', () => {
      const fetcher = new GitlabFetcher();
      expect(fetcher.getHost()).toBe('https://gitlab.com');
    });

    it('should accept custom host', () => {
      const fetcher = new GitlabFetcher(undefined, 'https://private.gitlab.com');
      expect(fetcher.getHost()).toBe('https://private.gitlab.com');
    });

    it('should strip trailing slashes from host', () => {
      const fetcher = new GitlabFetcher(undefined, 'https://private.gitlab.com///');
      expect(fetcher.getHost()).toBe('https://private.gitlab.com');
    });
  });

  describe('rateLimit', () => {
    it('should return Infinity', async () => {
      const fetcher = new GitlabFetcher();
      expect(await fetcher.rateLimit()).toBe(Infinity);
    });
  });

  describe('getLatestRelease', () => {
    it('should call the correct API endpoint', async () => {
      const mockRelease = {
        tag_name: 'v1.0.0',
        name: 'Release v1.0.0',
        description: 'First release',
        created_at: '2024-01-01T00:00:00Z',
        released_at: '2024-01-01T00:00:00Z',
        upcoming_release: false,
        assets: { links: [] },
      };
      mockFetchJson([mockRelease]);

      const fetcher = new GitlabFetcher('my-token', 'https://gitlab.com');
      const release = await fetcher.getLatestRelease('group', 'project');

      expect(release.tag_name).toBe('v1.0.0');
      expect(release.draft).toBe(false);

      // Verify the URL was constructed correctly
      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[0]).toBe('https://gitlab.com/api/v4/projects/group%2Fproject/releases?per_page=1');
    });

    it('should encode multi-level paths correctly', async () => {
      mockFetchJson([{
        tag_name: 'v1.0.0', name: '', description: '',
        created_at: '', released_at: '',
        upcoming_release: false, assets: { links: [] },
      }]);

      const fetcher = new GitlabFetcher('token');
      await fetcher.getLatestRelease('group/subgroup', 'project');

      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[0]).toContain('group%2Fsubgroup%2Fproject');
    });

    it('should throw when no releases found', async () => {
      mockFetchJson([]);

      const fetcher = new GitlabFetcher();
      await expect(fetcher.getLatestRelease('group', 'project')).rejects.toThrow('No releases found');
    });

    it('should include PRIVATE-TOKEN header when token is set', async () => {
      mockFetchJson([{
        tag_name: 'v1.0.0', name: '', description: '',
        created_at: '', released_at: '',
        upcoming_release: false, assets: { links: [] },
      }]);

      const fetcher = new GitlabFetcher('glpat-my-secret');
      await fetcher.getLatestRelease('group', 'project');

      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[1].headers['PRIVATE-TOKEN']).toBe('glpat-my-secret');
    });

    it('should not include PRIVATE-TOKEN header when no token', async () => {
      mockFetchJson([{
        tag_name: 'v1.0.0', name: '', description: '',
        created_at: '', released_at: '',
        upcoming_release: false, assets: { links: [] },
      }]);

      const fetcher = new GitlabFetcher();
      await fetcher.getLatestRelease('group', 'project');

      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[1].headers['PRIVATE-TOKEN']).toBeUndefined();
    });
  });

  describe('getReleases', () => {
    it('should return all releases from paginated results', async () => {
      const releases = Array.from({ length: 3 }, (_, i) => ({
        tag_name: `v${i + 1}.0.0`, name: `Release ${i + 1}`,
        description: '', created_at: '', released_at: '',
        upcoming_release: false, assets: { links: [] },
      }));
      mockFetchJson(releases);

      const fetcher = new GitlabFetcher();
      const result = await fetcher.getReleases('group', 'project');

      expect(result).toHaveLength(3);
      expect(result[0].tag_name).toBe('v1.0.0');
      expect(result[2].tag_name).toBe('v3.0.0');
    });

    it('should convert upcoming_release to prerelease', async () => {
      mockFetchJson([{
        tag_name: 'v1.0.0-rc', name: 'RC',
        description: '', created_at: '', released_at: '',
        upcoming_release: true, assets: { links: [] },
      }]);

      const fetcher = new GitlabFetcher();
      const result = await fetcher.getReleases('group', 'project');

      expect(result[0].prerelease).toBe(true);
    });
  });

  describe('downloadReleaseAsset', () => {
    it('should download a zip asset link when available', async () => {
      // First call: get release by tag (returns release with asset links)
      // Second call: download the asset
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) {
          // Release by tag endpoint
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              tag_name: 'v1.0.0',
              name: 'v1.0.0',
              description: '',
              created_at: '2024-01-01',
              released_at: '2024-01-01',
              upcoming_release: false,
              assets: {
                links: [{
                  name: 'project.zip',
                  url: 'https://gitlab.com/api/uploads/project.zip',
                  direct_asset_url: 'https://gitlab.com/group/project/-/releases/v1.0.0/downloads/project.zip',
                  link_type: 'package',
                }],
              },
            }),
          });
        }
        // Download endpoint
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(2048)),
        });
      });

      const fetcher = new GitlabFetcher('token');
      const buffer = await fetcher.downloadReleaseAsset('group', 'project', 'v1.0.0');

      expect(buffer.byteLength).toBe(2048);
      expect(callCount).toBe(2);
    });

    it('should fall back to source archive when no zip asset link', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              tag_name: 'v1.0.0', name: '', description: '',
              created_at: '', released_at: '',
              upcoming_release: false,
              assets: { links: [] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
        });
      });

      const fetcher = new GitlabFetcher('token');
      const buffer = await fetcher.downloadReleaseAsset('group', 'project', 'v1.0.0');

      expect(buffer.byteLength).toBe(1024);

      // Second call should be to the source archive fallback
      const secondCallUrl = (global.fetch as any).mock.calls[1][0];
      expect(secondCallUrl).toContain('/repository/archive.zip');
      expect(secondCallUrl).toContain('sha=v1.0.0');
    });

    it('should throw on download failure', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              tag_name: 'v1.0.0', name: '', description: '',
              created_at: '', released_at: '',
              upcoming_release: false,
              assets: { links: [] },
            }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });
      });

      const fetcher = new GitlabFetcher('token');
      await expect(fetcher.downloadReleaseAsset('group', 'project', 'v1.0.0'))
        .rejects.toThrow('Failed to download release asset');
    });

    it('should throw on API error', async () => {
      mockFetchJson({}, 403);

      const fetcher = new GitlabFetcher('bad-token');
      await expect(fetcher.downloadReleaseAsset('group', 'project', 'v1.0.0'))
        .rejects.toThrow('GitLab API error 403');
    });

    it('should not send token when downloading from external host', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              tag_name: 'v1.0.0', name: '', description: '',
              created_at: '', released_at: '',
              upcoming_release: false,
              assets: {
                links: [{
                  name: 'project.zip',
                  url: 'https://cdn.example.com/project.zip',
                  direct_asset_url: 'https://cdn.example.com/project.zip',
                  link_type: 'package',
                }],
              },
            }),
          });
        }
        // Verify the download request doesn't include the token
        expect(opts.headers?.['PRIVATE-TOKEN']).toBeUndefined();
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
        });
      });

      const fetcher = new GitlabFetcher('glpat-secret', 'https://gitlab.com');
      await fetcher.downloadReleaseAsset('group', 'project', 'v1.0.0');

      expect(callCount).toBe(2);
    });

    it('should prefer zip link containing project name', async () => {
      let downloadUrl = '';
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              tag_name: 'v1.0.0', name: '', description: '',
              created_at: '', released_at: '',
              upcoming_release: false,
              assets: {
                links: [
                  {
                    name: 'docs.zip',
                    url: 'https://gitlab.com/docs.zip',
                    direct_asset_url: 'https://gitlab.com/docs.zip',
                    link_type: 'other',
                  },
                  {
                    name: 'myproject.zip',
                    url: 'https://gitlab.com/myproject.zip',
                    direct_asset_url: 'https://gitlab.com/myproject.zip',
                    link_type: 'package',
                  },
                ],
              },
            }),
          });
        }
        downloadUrl = url;
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(256)),
        });
      });

      const fetcher = new GitlabFetcher('token');
      await fetcher.downloadReleaseAsset('group', 'myproject', 'v1.0.0');

      expect(downloadUrl).toContain('myproject.zip');
    });
  });
});
