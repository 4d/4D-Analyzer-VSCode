import * as fs from 'fs';
import * as path from 'path';

export interface LiveServiceTargetConfig {
  dependencyName: string;
  repository: string;
  version?: string;
  tag?: string;
  host?: string;
  token?: string;
  hostEnv?: string;
  tokenEnv?: string;
  requireToken?: boolean;
}

export interface LiveServicesConfigFile {
  github?: LiveServiceTargetConfig;
  gitlab?: LiveServiceTargetConfig;
  privateGitlab?: LiveServiceTargetConfig;
}

export interface ResolvedLiveServiceTarget extends LiveServiceTargetConfig {
  host?: string;
  token?: string;
}

export interface ResolvedLiveServicesConfig {
  github?: ResolvedLiveServiceTarget;
  gitlab?: ResolvedLiveServiceTarget;
  privateGitlab?: ResolvedLiveServiceTarget;
}

export interface LiveServicesConfigState {
  config?: ResolvedLiveServicesConfig;
  configPath: string;
  examplePath: string;
  missingConfig: boolean;
}

const DEFAULT_CONFIG_FILE = 'live-services.config.local.json';
const EXAMPLE_CONFIG_FILE = 'live-services.config.example.json';
const DEFAULT_PRIVATE_GITLAB_HOST_ENV = 'PRIVATE_GITLAB_URL';

function resolveConfigPath(): string {
  const configuredPath = process.env.LIVE_SERVICES_CONFIG;
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
  }

  return path.join(__dirname, DEFAULT_CONFIG_FILE);
}

function resolveTarget(
  target: LiveServiceTargetConfig | undefined,
  defaults?: Partial<LiveServiceTargetConfig>
): ResolvedLiveServiceTarget | undefined {
  if (!target) {
    return undefined;
  }

  const hostEnv = target.hostEnv ?? defaults?.hostEnv;
  const tokenEnv = target.tokenEnv ?? defaults?.tokenEnv;
  const host = hostEnv ? process.env[hostEnv] ?? target.host : target.host;
  const token = tokenEnv ? process.env[tokenEnv] ?? target.token : target.token;

  return {
    ...target,
    host,
    hostEnv,
    tokenEnv,
    token,
    requireToken: target.requireToken ?? defaults?.requireToken,
  };
}

export function loadLiveServicesConfig(): LiveServicesConfigState {
  const configPath = resolveConfigPath();
  const examplePath = path.join(path.dirname(configPath), EXAMPLE_CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    return {
      configPath,
      examplePath,
      missingConfig: true,
    };
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as LiveServicesConfigFile;

  return {
    configPath,
    examplePath,
    missingConfig: false,
    config: {
      github: resolveTarget(parsed.github, { tokenEnv: 'GITHUB_TOKEN' }),
      gitlab: resolveTarget(parsed.gitlab, { host: 'https://gitlab.com', tokenEnv: 'GITLAB_TOKEN' }),
      privateGitlab: resolveTarget(parsed.privateGitlab, {
        hostEnv: DEFAULT_PRIVATE_GITLAB_HOST_ENV,
        tokenEnv: 'PRIVATE_GITLAB_TOKEN',
        requireToken: true,
      }),
    },
  };
}

export function hasRunnableTarget(target: ResolvedLiveServiceTarget | undefined): boolean {
  if (!target) {
    return false;
  }

  if (!target.dependencyName || !target.repository) {
    return false;
  }

  if (target.requireToken && !target.token) {
    return false;
  }

  if (target.hostEnv && !target.host) {
    return false;
  }

  return true;
}