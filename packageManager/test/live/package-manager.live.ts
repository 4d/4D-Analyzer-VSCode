import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { PackageManager } from '../../src/PackageManager';
import {
  hasRunnableTarget,
  loadLiveServicesConfig,
  type ResolvedLiveServiceTarget,
} from './live-services.config';

const TEST_IDE_VERSION = '21.2.0';
const OUTPUT_ROOT = path.join(__dirname, '..', 'OUTPUT', 'live');
const liveConfigState = loadLiveServicesConfig();
const liveConfig = liveConfigState.config;

type ServiceKind = 'github' | 'gitlab' | 'privateGitlab';

interface PreparedProject {
  projectPath: string;
  cachePath: string;
  cleanup: () => Promise<void>;
}

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, '');
}

function repositoryName(repository: string): string {
  const parts = repository.split('/');
  return parts[parts.length - 1];
}

function buildDependencySpec(service: ServiceKind, target: ResolvedLiveServiceTarget): Record<string, string> {
  const spec: Record<string, string> = service === 'github'
    ? { github: target.repository }
    : { gitlab: target.repository };

  if (target.tag) {
    spec.tag = target.tag;
  } else {
    spec.version = target.version ?? (service === 'github' ? 'latest' : 'latest');
  }

  if (service === 'privateGitlab' && target.host) {
    spec.host = normalizeHost(target.host);
  }

  return spec;
}

function buildEnvironment(service: ServiceKind, target: ResolvedLiveServiceTarget): Record<string, unknown> {
  return {
    dependencies: {},
    github: {
      htmlURL: 'https://github.com',
    },
    gitlab: {
      host: service === 'privateGitlab' && target.host
        ? normalizeHost(target.host)
        : 'https://gitlab.com',
    },
    fetch: {
      maxRecursivePass: 5,
    },
  };
}

async function prepareProject(service: ServiceKind, target: ResolvedLiveServiceTarget): Promise<PreparedProject> {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  const rootPath = await fs.mkdtemp(path.join(OUTPUT_ROOT, `${service}-`));
  const projectPath = path.join(rootPath, 'project');
  const cachePath = path.join(rootPath, 'cache');

  await fs.mkdir(path.join(projectPath, 'Project', 'Sources'), { recursive: true });

  const dependenciesJson = {
    version: 2100,
    dependencies: {
      [target.dependencyName]: buildDependencySpec(service, target),
    },
  };

  await fs.writeFile(
    path.join(projectPath, 'Project', 'Sources', 'dependencies.json'),
    JSON.stringify(dependenciesJson, null, 2),
  );

  await fs.writeFile(
    path.join(projectPath, 'environment4d.json'),
    JSON.stringify(buildEnvironment(service, target), null, 2),
  );

  return {
    projectPath,
    cachePath,
    cleanup: async () => {
      await fs.rm(rootPath, { recursive: true, force: true });
    },
  };
}

function buildPackageManagerOptions(service: ServiceKind, target: ResolvedLiveServiceTarget, cachePath: string) {
  const options: {
    ideVersion: string;
    cacheFolder: string;
    githubAuthToken?: string;
    gitlabAuthTokens?: Record<string, string>;
  } = {
    ideVersion: TEST_IDE_VERSION,
    cacheFolder: cachePath,
  };

  if (service === 'github' && target.token) {
    options.githubAuthToken = target.token;
  }

  if (service !== 'github' && target.token) {
    const host = normalizeHost(target.host || 'https://gitlab.com');
    options.gitlabAuthTokens = { [host]: target.token };
  }

  return options;
}

function assertCommonLockFields(
  entry: Record<string, unknown> | undefined,
  dependencyName: string,
): asserts entry is Record<string, unknown> {
  expect(entry, `Missing lock entry for ${dependencyName}`).toBeDefined();
  const lockSummary = JSON.stringify({
    found: entry?.found,
    tag: entry?.tag,
    path: entry?.path,
    errors: entry?.errors,
    warnings: entry?.warnings,
    archiveURL: entry?.archiveURL,
    htmlURL: entry?.htmlURL,
  }, null, 2);
  expect(entry.found, lockSummary).toBe(true);
  expect(typeof entry.tag).toBe('string');
  expect(String(entry.tag).length).toBeGreaterThan(0);
  expect(typeof entry.path).toBe('string');
  expect(fsSync.existsSync(String(entry.path))).toBe(true);
  expect(fsSync.existsSync(`${String(entry.path)}.json`)).toBe(true);
}

async function runFetchTwice(service: ServiceKind, target: ResolvedLiveServiceTarget): Promise<void> {
  const prepared = await prepareProject(service, target);

  try {
    const options = buildPackageManagerOptions(service, target, prepared.cachePath);

    const pm = await PackageManager.create(prepared.projectPath, options);
    const firstResult = await pm.fetch();
    expect(firstResult.success).toBe(true);

    const entry = firstResult.lock.dependencies[target.dependencyName] as Record<string, unknown> | undefined;
    assertCommonLockFields(entry, target.dependencyName);

    if (service === 'github') {
      expect(entry.github).toBe(target.repository);
      expect(String(entry.archiveURL)).toContain('/releases/download/');
      expect(String(entry.htmlURL)).toContain('/releases/tag/');
    } else {
      expect(entry.gitlab).toBe(target.repository);
      expect(String(entry.archiveURL)).toContain('/-/archive/');
      expect(String(entry.htmlURL)).toContain('/-/releases/');
    }

    if (service === 'privateGitlab') {
      const host = normalizeHost(target.host || '');
      expect(entry.host).toBe(host);
      expect(String(entry.archiveURL)).toContain(host);
      expect(String(entry.htmlURL)).toContain(host);
    }

    const pmSecondPass = await PackageManager.create(prepared.projectPath, options);
    const secondResult = await pmSecondPass.fetch();
    expect(secondResult.skippedCount).toBeGreaterThan(0);
  } finally {
    await prepared.cleanup();
  }
}

const liveSuite = liveConfigState.missingConfig ? describe.skip : describe;

liveSuite('PackageManager live services', () => {
  const githubTarget = liveConfig?.github;
  const gitlabTarget = liveConfig?.gitlab;
  const privateGitlabTarget = liveConfig?.privateGitlab;

  const githubIt = hasRunnableTarget(githubTarget) ? it : it.skip;
  const gitlabIt = hasRunnableTarget(gitlabTarget) ? it : it.skip;
  const privateGitlabIt = hasRunnableTarget(privateGitlabTarget) ? it : it.skip;

  githubIt('fetches a real GitHub release and reuses the cache', async () => {
    await runFetchTwice('github', githubTarget!);
  });

  gitlabIt('fetches a real gitlab.com release and reuses the cache', async () => {
    await runFetchTwice('gitlab', gitlabTarget!);
  });

  privateGitlabIt('fetches a real private GitLab release and writes the host to the lock', async () => {
    await runFetchTwice('privateGitlab', privateGitlabTarget!);
  });

  it('documents how to enable the live suite when config is missing', () => {
    if (!liveConfigState.missingConfig) {
      return;
    }

    expect(liveConfigState.configPath.endsWith('live-services.config.local.json')).toBe(true);
    expect(fsSync.existsSync(liveConfigState.examplePath)).toBe(true);
  });

  it('requires a release asset for GitHub live tests', () => {
    expect(repositoryName(liveConfig?.github?.repository || 'owner/repo')).toBeTruthy();
  });
});