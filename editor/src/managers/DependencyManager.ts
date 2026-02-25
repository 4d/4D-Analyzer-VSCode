import * as vscode from 'vscode';
import * as path from "path";
import * as fsSync from 'fs';
import { LanguageClient } from 'vscode-languageclient/node';
import * as ext from "../lsp_ext";
import { Logger } from "../logger";
import { LabeledVersion } from '../labeledVersion';
import { FetchOptions, PackageManager } from "@4dsas/package-manager";

export class DependencyManager {

    private _listWatcher: vscode.Disposable[] = [];
    private _statusBarItem: vscode.StatusBarItem;

    constructor(
        private _extensionContext: vscode.ExtensionContext,
        private _4DVersion: LabeledVersion
    ) {
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    }

    public registerNotificationHandlers(client: LanguageClient, onRestartNeeded: () => void): void {
        client.onNotification(ext.notif_needFetchNotification, async (params) => {
            Logger.log("Fetch...", params.uri);
            this._statusBarItem.text = "$(sync~spin) Fetch components ...";
            this._statusBarItem.show();

            const GITHUB_AUTH_PROVIDER_ID = 'github';
            // The GitHub Authentication Provider accepts the scopes described here:
            // https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
            //repo: Full control of private repositories
            //public_repo: Access public repositories
            const SCOPES = ['repo', 'public_repo'];

            const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });
            if (!session) {
                //Error message user interface
                vscode.window.showErrorMessage("GitHub authentication is required to fetch 4D components. Please sign in to GitHub.");
                client.sendNotification(ext.notif_installComponents, params);
                return;
            }

            const parsed = vscode.Uri.parse(params.uri).fsPath;
            const packageFolder = path.dirname(path.dirname(parsed));

            try {

                const packageManager = new PackageManager(packageFolder,
                    this._4DVersion.toString(false), session.accessToken, undefined, (dependencyName) => {
                        this._statusBarItem.text = `$(sync~spin) Fetch components... (${dependencyName})`;
                    });
                await packageManager.initialize();
                let options: FetchOptions = {};
                packageManager.fetch(options).then(() => {
                    this._statusBarItem.text = "$(sync~spin) Install components...";
                    client.sendNotification(ext.notif_installComponents, params);
                });
            } catch (error) {
                this._statusBarItem.hide();
                Logger.log(error);
                vscode.window.showErrorMessage(error);
            }

            return true;
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


        const possiblePaths = ["../environment4d.json", "../../environment4d.json"];
        let envAbs: string | undefined = undefined;

        for (const rel of possiblePaths) {
            const candidate = path.resolve(projectFolder, rel); // absolute
            if (fsSync.existsSync(candidate)) {
                envAbs = candidate;
                break;
            }
        }

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
}
