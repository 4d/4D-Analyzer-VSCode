import * as vscode from 'vscode';
import * as path from "path";
import * as fs from 'fs';
import { LanguageClient } from 'vscode-languageclient/node';
import * as ext from "../lsp_ext";
import { Logger } from "../logger";
import { LabeledVersion } from '../labeledVersion';
import { PackageManager } from "@4dsas/package-manager";
import type { Logger as PMLogger } from "@4dsas/package-manager";
import { DependencyOverlay } from './DependencyOverlay';

export class DependencyManager {

    private _listWatcher: vscode.Disposable[] = [];
    private _statusBarItem: vscode.StatusBarItem;
    private _depChannel: vscode.OutputChannel;

    constructor(
        private _extensionContext: vscode.ExtensionContext,
        private _4DVersion: LabeledVersion
    ) {
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
        this._depChannel = vscode.window.createOutputChannel("4D-Dependencies");

        this._extensionContext.subscriptions.push(this._statusBarItem, this._depChannel);
        new DependencyOverlay(this._extensionContext);
    }

    private createLogger(): PMLogger {
        const channel = this._depChannel;
        const debugEnabled = vscode.workspace.getConfiguration("4D-Analyzer").get<boolean>("dependencies.debug", false);
        const stamp = () => `[${new Date().toLocaleString()}]`;
        return {
            info(message: string)  { channel.appendLine(`${stamp()} [INFO]  ${message}`); },
            debug(message: string) { if (debugEnabled) { channel.appendLine(`${stamp()} [DEBUG] ${message}`); } },
            warn(message: string)  { channel.appendLine(`${stamp()} [WARN]  ${message}`); },
            error(message: string) { channel.appendLine(`${stamp()} [ERROR] ${message}`); },
        };
    }

    private projectHasGitLabDependencies(packageFolder: string): boolean {
        try {
            const depsFilePath = path.join(packageFolder, 'Project', 'Sources', 'dependencies.json');
            const content = fs.readFileSync(depsFilePath, 'utf-8');
            const parsed = JSON.parse(content);
            return Object.values(parsed.dependencies ?? {}).some((dep: any) => !!dep.gitlab);
        } catch {
            return false;
        }
    }

    private async getGitHubSession(): Promise<vscode.AuthenticationSession | undefined> {
        // The GitHub Authentication Provider accepts the scopes described here:
        // https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
        //repo: Full control of private repositories
        //public_repo: Access public repositories
        const SCOPES = ['repo', 'public_repo'];
        try {
            const session = await vscode.authentication.getSession('github', SCOPES, { createIfNone: true });
            return session ?? undefined;
        } catch {
            return undefined;
        }
    }

    public registerNotificationHandlers(client: LanguageClient, onRestartNeeded: () => void): void {
        client.onNotification(ext.notif_needFetchNotification, async (params) => {
            if (!params?.project_uri) {
                Logger.log(`ERROR: Fetch Notification received without project_uri: ${JSON.stringify(params)}`);
                return;
            }
            Logger.log("Fetch...", params.project_uri);
            this._statusBarItem.text = "$(sync~spin) Fetch components ...";
            this._statusBarItem.show();

            const session = await this.getGitHubSession();
            if (!session) {
                vscode.window.showErrorMessage("GitHub authentication is required to fetch 4D components. Please sign in to GitHub.");
                client.sendNotification(ext.notif_installComponents, { uri: params.project_uri });
                return;
            }

            const parsed = vscode.Uri.parse(params.project_uri).fsPath;
            const packageFolder = path.dirname(path.dirname(parsed));
            const preferencesFolder = params.preferences_uri
                ? vscode.Uri.parse(params.preferences_uri).fsPath
                : undefined;

            // Attempt to get GitLab tokens (best-effort, silent).
            // The GitLab extension exposes all accounts (across instances)
            // via its auth provider. Each session's account.id is "instanceUrl|userId".
            // We use getAccounts() (VS Code ≥1.93) to enumerate all instances and
            // build a host→token map so each host gets its own token.
            const logger = this.createLogger();
            const gitlabAuthTokens: Record<string, string> = {};
            try {
                const accounts = await vscode.authentication.getAccounts('gitlab');
                logger.debug(`[GitLab] Found ${accounts.length} account(s)`);

                if (accounts.length === 0 && this.projectHasGitLabDependencies(packageFolder)) {
                    // No known accounts but project has GitLab dependencies — prompt sign-in.
                    logger.debug('[GitLab] No accounts found but project has GitLab dependencies, prompting sign-in');
                    const gitlabExtInstalled = !!vscode.extensions.getExtension('GitLab.gitlab-workflow');
                    if (gitlabExtInstalled) {
                        vscode.window.showErrorMessage(
                            'GitLab authentication is required to fetch GitLab components.',
                            'Authenticate with GitLab'
                        ).then(selection => {
                            if (selection === 'Authenticate with GitLab') {
                                vscode.commands.executeCommand('gl.authenticate');
                            }
                        });
                    } else {
                        vscode.window.showErrorMessage(
                            'GitLab authentication is required to fetch GitLab components. Please install the GitLab extension and authenticate.',
                            'GitLab Extension'
                        ).then(selection => {
                            if (selection === 'GitLab Extension') {
                                vscode.env.openExternal(vscode.Uri.parse('https://docs.gitlab.com/editor_extensions/visual_studio_code/setup/'));
                            }
                        });
                    }
                } else {
                    for (const account of accounts) {
                        logger.debug(`[GitLab] Getting session for account: ${account.id} (${account.label})`);
                        // Use createIfNone to show a modal consent dialog if the
                        // extension hasn't been granted access yet.  Without it VS Code
                        // only adds a silent badge on the Accounts icon.
                        const gitlabSession = await vscode.authentication.getSession(
                            'gitlab', ['api'], { account, createIfNone: true }
                        );
                        if (gitlabSession) {
                            // account.id = "instanceUrl|userId" (see makeAccountId in gitlab_account.ts)
                            const pipeIndex = account.id.lastIndexOf('|');
                            const instanceUrl = pipeIndex > 0
                                ? account.id.substring(0, pipeIndex).replace(/\/+$/, '')
                                : 'https://gitlab.com';
                            gitlabAuthTokens[instanceUrl] = gitlabSession.accessToken;
                            logger.debug(`[GitLab] Got token for ${instanceUrl} (session account: ${gitlabSession.account.id})`);
                        } else {
                            logger.debug(`[GitLab] No session returned for account: ${account.id}`);
                        }
                    }
                }

                const hostList = Object.keys(gitlabAuthTokens);
                logger.debug(`[GitLab] Token map has ${hostList.length} host(s): ${hostList.join(', ')}`);
                for (const [host, token] of Object.entries(gitlabAuthTokens)) {
                    logger.debug(`[GitLab]   ${host} => token length=${token.length}, starts=${token.substring(0, 8)}...`);
                }
            } catch (e) {
                logger.debug(`[GitLab] Failed to get accounts: ${e}`);
                // GitLab extension not installed or no accounts — continue without
            }

            try {
                const packageManager = await PackageManager.create(packageFolder, {
                    ideVersion: this._4DVersion.toString(false),
                    githubAuthToken: session.accessToken,
                    gitlabAuthTokens,
                    preferencesFolder,
                    logger,
                    callback: (dependencyName) => {
                        this._statusBarItem.text = `$(sync~spin) Fetch components... (${dependencyName})`;
                    }
                });
                await packageManager.fetch({});
                this._statusBarItem.text = "$(sync~spin) Install components...";
                client.sendNotification(ext.notif_installComponents, { uri: params.project_uri });
            } catch (error) {
                this._statusBarItem.hide();
                Logger.log(error);
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(message);
            }
        });

        client.onNotification(ext.notif_installComponents_before, async (params) => {
            this._statusBarItem.text = "$(sync~spin) Install components...";
            Logger.log("Install components...");
            this._statusBarItem.show();
            client.sendNotification(ext.notif_installComponents, params);
            return true;
        });

        client.onNotification(ext.notif_installComponents_done, async (params) => {
            Logger.log("Install components done", params.uri);
            this.dependencyWatcher(params.uri, onRestartNeeded);

            this._statusBarItem.hide();
            return true;
        });
    }

    public disposeWatchers(): void {
        for (const dispose of this._listWatcher) {
            dispose.dispose();
        }
        this._listWatcher = [];
    }

    public async prepare_database(client: LanguageClient, DBID: string, callback: (success: boolean) => void): Promise<void> {

        try {
            const result = await client.sendRequest(ext.prepare_database, { uri: DBID });

            if (!result || !result.valid) {
                callback(false);
                return;
            }

            // Set up the notification handler to wait for the installation to complete
            const disposable = client.onNotification(ext.notif_installComponents_done, async (params) => {

                if (params.uri === result.id.uri) {
                    disposable.dispose(); // Clean up handler after it's called once
                    callback(true);
                }
            });

            client.sendNotification(ext.prepare_components, { uri: result.id.uri });

        } catch (error) {
            Logger.debugLog(`Error sending prepare_database request: ${error}`);
            callback(false);
        }
    }

    public async validateJsonDocument(uri: vscode.Uri): Promise<boolean> {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            JSON.parse(Buffer.from(content).toString('utf-8'));
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Invalid JSON in ${uri.fsPath}: ${error.message}`);
            return false;
        }
    }

    public async dependencyChange(uri: vscode.Uri, onRestartNeeded: () => void): Promise<void> {
        if (await this.validateJsonDocument(uri)) {
            const userResponse = await vscode.window.showInformationMessage(
                `The dependency have been changed, do you want to reload?`,
                "Reload now"
            );

            if (userResponse === "Reload now") {
                onRestartNeeded();
            }
        }
    }

    public dependencyWatcher(project_id: string, onRestartNeeded: () => void): void {
        const projectFolder = path.resolve(vscode.Uri.parse(project_id).fsPath, "../../");
        const dependencyFile = new vscode.RelativePattern(projectFolder, 'Project/Sources/dependencies.json');
        const watcher = vscode.workspace.createFileSystemWatcher(dependencyFile);
        Logger.log("Watch dependencies for ", dependencyFile.baseUri);

        const disposable = watcher.onDidChange(async uri => {
            Logger.log("File has changed ", uri);

            this.dependencyChange(uri, onRestartNeeded);
        });
        this._listWatcher.push(disposable);
        this._extensionContext.subscriptions.push(watcher, disposable);


        const envAbs = this.findNearestEnvironmentFileSync(projectFolder);

        if (envAbs) {
            const envDir = path.dirname(envAbs);
            const envName = path.basename(envAbs);

            const environmentPattern = new vscode.RelativePattern(envDir, envName);
            const envWatcher = vscode.workspace.createFileSystemWatcher(environmentPattern);

            const envDisposable = envWatcher.onDidChange(async uri => {
                this.dependencyChange(uri, onRestartNeeded);

            });

            this._extensionContext.subscriptions.push(envWatcher, envDisposable);
            this._listWatcher.push(envDisposable);
        }
    }

    private findNearestEnvironmentFileSync(startDir: string): string | undefined {
        let currentDir = startDir;
        const root = path.parse(currentDir).root;

        while (true) {
            const envFile = path.join(currentDir, 'environment4d.json');
            if (fs.existsSync(envFile)) {
                return envFile;
            }

            if (currentDir === root) {
                return undefined;
            }

            currentDir = path.dirname(currentDir);
        }
    }

}
