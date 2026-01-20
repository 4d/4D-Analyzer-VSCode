import * as vscode from 'vscode';
import * as Commands from "./commands";
import { Config } from "./config";
import { LabeledVersion } from './labeledVersion';
import { ResultUpdate, ToolPreparator } from "./tool4D/toolPreparator";
import {
    LanguageClient,
    LanguageClientOptions,
    StreamInfo,
    TextDocumentIdentifier,
} from 'vscode-languageclient/node';
import * as ext from "./lsp_ext";

import { workspace } from 'vscode';
import * as child_process from 'child_process';
import * as net from 'net';
import { Logger } from "./logger";
import { existsSync, readdirSync, rmdirSync, rm } from "fs";
import * as path from "path";
import { FetchOptions, PackageManager } from "@4dsas/package-manager";
import * as fsSync from 'fs';

export type CommandCallback = {
    call: (ctx: Ctx) => Commands.Cmd;
};

export class Ctx {
    private _client: LanguageClient;
    private _extensionContext: vscode.ExtensionContext;
    private _commands: Record<string, CommandCallback>;
    private _config: Config;
    private _transportServer: net.Server | null;
    private _languageServerProcess: child_process.ChildProcess | null;
    private _listWatcher = [] as vscode.Disposable[]; //watcher to dispose
    private _isRestarting = false;
    private _restartDebounceTimer: NodeJS.Timeout | null = null;
    constructor(ctx: vscode.ExtensionContext) {
        this._client = null;
        this._extensionContext = ctx;
        this._commands = {};
        this._config = null;
        this._transportServer = null;
        this._languageServerProcess = null;
    }

    public get config(): Config {
        return this._config;
    }

    public get extensionContext(): vscode.ExtensionContext {
        return this._extensionContext;
    }

    public get client(): LanguageClient {
        return this._client;
    }


    private _getServerPath(isDebug: boolean): string {
        let serverPath: string = this._config.serverPath;

        if (process.env.ANALYZER_4D_PATH) {
            serverPath = process.env.ANALYZER_4D_PATH;
        }

        if (isDebug) {
            serverPath = '';//debug
        }

        return serverPath;
    }

    private _getPort(isDebug: boolean): number {
        let port = 0;
        if (process.env.ANALYZER_4D_PORT) {
            port = parseInt(process.env.ANALYZER_4D_PORT);
        }

        if (isDebug) {
            port = 1800;
        }

        return port;
    }


    public async prepareTool4D(inVersion: string, inLocation: string, inChannel: string): Promise<ResultUpdate> {
        const toolPreparator: ToolPreparator = new ToolPreparator(inVersion, inChannel, this._config.tool4dAPIKEY());
        const outLocation = !inLocation ? this.extensionContext.globalStorageUri.fsPath : inLocation;
        return toolPreparator.prepareTool4D(outLocation);
    }

    public async cleanUnusedToolVersions() {
        function getDirectories(source: string) {
            if (existsSync(source)) {
                return readdirSync(source, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
            }
            return [];
        }

        const location = path.join(!this._config.tool4DLocation() ? this.extensionContext.globalStorageUri.fsPath : this._config.tool4DLocation(), "tool4d");
        if (!this._config.serverPath) //no path are ready
        {
            rmdirSync(location);
        }
        else {
            const labeledVersion = this.get4DVersion();

            const labeledVersionWithoutChangelist = labeledVersion.clone();
            labeledVersionWithoutChangelist.changelist = 0;
            const directories = getDirectories(location);
            directories.forEach(async directory => {
                const currentLabeledFolder = LabeledVersion.fromString(directory);

                if (currentLabeledFolder.compare(labeledVersionWithoutChangelist) != 0) {
                    rm(path.join(location, directory), { recursive: true }, () => { });
                }
                else {
                    const directoriesChangelist = getDirectories(path.join(location, directory));
                    directoriesChangelist.forEach(async dir => {
                        if (Number(dir) != labeledVersion.changelist) {
                            rm(path.join(location, directory, dir), { recursive: true }, () => { });
                        }
                    });
                }
            });
        }
    }

    public async downloadLastTool4D(): Promise<ResultUpdate> {
        const toolPreparator: ToolPreparator = new ToolPreparator(this._config.tool4DWanted(), this._config.tool4DDownloadChannel(), this._config.tool4dAPIKEY());
        const outLocation = !this._config.tool4DLocation() ? this.extensionContext.globalStorageUri.fsPath : this._config.tool4DLocation();
        return toolPreparator.prepareLastTool(outLocation, true);
    }

    public get4DVersion(): LabeledVersion {
        return this._config.get4DVersion();
    }

    private _launch4D() {
        this._config.init(this);
        this._config.checkSettings();
        let isDebug: boolean;
        isDebug = false;
        if (process.env.ANALYZER_4D_DEBUG) {
            isDebug = true;
        }

        const serverPath: string = this._getServerPath(isDebug);
        const port: number = this._getPort(isDebug);

        Logger.debugLog("SERVER PATH", serverPath);

        const serverOptions = () =>
            new Promise<child_process.ChildProcess | StreamInfo>((resolve, reject) => {
                // Use a TCP socket because of problems with blocking STDIO
                const server = net.createServer(socket => {
                    // 'connection' listener
                    Logger.debugLog('4D process connected');
                    socket.on('end', () => {
                        Logger.debugLog('4D process disconnected');
                        server.close();
                    });
                    socket.on('close', () => {
                        Logger.debugLog('4D process disconnected');
                        server.close();
                    });
                    socket.on('error', (e) => {
                        Logger.debugLog(e);
                        server.close();
                    });
                    resolve({ reader: socket, writer: socket, detached: false });
                });

                this._transportServer = server;

                server.on('error', (error) => {
                    Logger.debugLog(error);
                    try {
                        server.close();
                    } catch (closeError) {
                        Logger.debugLog(closeError);
                    }
                    this._transportServer = null;
                    reject(error);
                });

                // Listen on random port
                server.listen(port, '127.0.0.1', () => {
                    Logger.debugLog(`Listens on port: ${(server.address() as net.AddressInfo).port}`);

                    if (serverPath != '') {
                        const childProcess = child_process.spawn(serverPath, [
                            '--lsp=' + (server.address() as net.AddressInfo).port,
                        ]);

                        this._languageServerProcess = childProcess;

                        childProcess.stderr.on('data', (chunk: Buffer) => {
                            const str = chunk.toString();
                            Logger.debugLog('4D Language Server:', str);
                            this._client.outputChannel.appendLine(str);
                        });

                        childProcess.on('exit', (code, signal) => {
                            this._client.outputChannel.appendLine(
                                `Language server exited ` + (signal ? `from signal ${signal}` : `with exit code ${code}`)
                            );
                            if (code !== 0) {
                                this._client.outputChannel.show();
                            }
                            if (this._languageServerProcess === childProcess) {
                                this._languageServerProcess = null;
                            }
                        });

                        server.on('close', () => {
                            Logger.debugLog("KILL");
                            if (this._languageServerProcess === childProcess) {
                                this._languageServerProcess = null;
                            }
                            childProcess.kill();
                            this._transportServer = null;
                        });

                        return childProcess;
                    }

                });
            });

        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            // Register the server for plain text documents
            documentSelector: [
                { scheme: 'file', language: '4d' },
                { scheme: 'file', language: '4qs' }
            ],
            synchronize: {
                // Notify the server about file changes to '.clientrc files contained in the workspace
                fileEvents: workspace.createFileSystemWatcher('**/.4DSettings'),
                // Configure textDocument sync options to include save notifications
                configurationSection: '4D-Analyzer'
            },
            initializationOptions: {
                ...this._config.cfg,
                dependencies: {
                    enable: true
                }
            },
            diagnosticCollectionName: "4d",
        };
        // Create the language client and start the client.
        this._client = new LanguageClient(
            '4D-Analyzer',
            '4D-LSP',
            serverOptions,
            clientOptions
        );

        const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            0
        );
        this._client.onNotification(ext.notif_needFetchNotification, async (params) => {
            Logger.debugLog("Fetch...", params.uri);
            statusBarItem.text = "$(sync~spin) Fetch components ...";
            statusBarItem.show();

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
                return;
            }

            const parsed = vscode.Uri.parse(params.uri).fsPath;
            const packageFolder = path.dirname(path.dirname(parsed));

            try {
                Logger.debugLog("4D Version", this.get4DVersion().toString(false));

                const packageManager = new PackageManager(packageFolder,
                    this.get4DVersion().toString(false), session.accessToken, undefined, (dependencyName) => {
                        statusBarItem.text = `$(sync~spin) Fetch components... (${dependencyName})`;
                    });
                await packageManager.initialize();
                let options: FetchOptions = {};
                packageManager.fetch(options).then(() => {
                    statusBarItem.text = "$(sync~spin) Install components...";
                    this._client.sendNotification(ext.notif_installComponents, params);
                });
            } catch (error) {
                statusBarItem.hide();
                Logger.debugLog(error);
                vscode.window.showErrorMessage(error);
            }

            return true;
        });

        this._client.onNotification(ext.notif_installComponents_before, async (params) => {
            statusBarItem.text = "$(sync~spin) Install components...";
            statusBarItem.show();
            this._client.sendNotification(ext.notif_installComponents, params);
            this.dependencyWatcher(params.uri);
            return true;
        });

        this._client.onNotification(ext.notif_installComponents_done, async (_params) => {
            statusBarItem.hide();
            return true;
        });
        this._client.start();
    }

    dependencyWatcher(project_id: string) {
        const projectFolder = path.resolve(vscode.Uri.parse(project_id).fsPath, "../../");
        const dependencyFile = new vscode.RelativePattern(projectFolder, 'Project/Sources/dependencies.json');
        const watcher = vscode.workspace.createFileSystemWatcher(dependencyFile);

        const disposable = watcher.onDidChange(async uri => {
            const fetchInfo = await this._client.sendRequest(ext.checkNeedFetch, TextDocumentIdentifier.create(project_id));
            if (fetchInfo.shouldFetch) {
                this._debouncedRestart();
            }

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
                //const fetchInfo = await this._client.sendRequest(ext.checkNeedFetch, TextDocumentIdentifier.create(project_id));
                this._debouncedRestart();
            });

            this._extensionContext.subscriptions.push(envWatcher, envDisposable);
            this._listWatcher.push(envDisposable);
        }


    }

    public start() {
        this._config = new Config(this._extensionContext);

        if (this._config.IsTool4DEnabled()) {
            this.prepareTool4D(this._config.tool4DWanted(), this._config.tool4DLocation(), this._config.tool4DDownloadChannel())
                .then(result => {
                    Logger.debugLog("PATH ", result.path);

                    this._config.setTool4DPath(result.path);
                    this._launch4D();
                })
                .catch((error: Error) => {
                    const userResponse = vscode.window.showErrorMessage(
                        error.message
                    );
                });
        }
        else {
            this._launch4D();
        }
    }

    public registerCommands() {

        this._commands = {
            filesStatus: { call: Commands.filesStatus },
            updateTool4D: { call: Commands.updateTool4D },
            display4DVersion: { call: Commands.display4DVersion },
            cleanUnusedToolVersions: { call: Commands.cleanUnusedToolVersions },
            checkWorkspaceSyntax: { call: Commands.checkWorkspaceSyntax },
            createNewProject: { call: Commands.createNewProject },
            restartLanguageServer: { call: Commands.restartLanguageServer },
        };

        for (const [name, command] of Object.entries(this._commands)) {
            const fullName = `4d-analyzer.${name}`;
            const callback = command.call(this);

            this._extensionContext.subscriptions.push(vscode.commands.registerCommand(fullName, callback));
        }
    }

    pushExtCleanup(d: Disposable) {
        this._extensionContext.subscriptions.push(d);
    }

    stop(): undefined | Promise<void> {
        if (!this._client) {
            return undefined;
        }

        return this._client.stop();
    }

    async restart() {
        // Prevent multiple concurrent restarts
        if (this._isRestarting) {
            return;
        }
        this._isRestarting = true;

        try {
            if (this._client) {
                try {
                    const stopPromise = this._client.stop();
                    if (stopPromise) {
                        await stopPromise;
                    }
                    this._client.dispose();
                    this._client = null;
                    for (const dispose of this._listWatcher) {
                        dispose.dispose();
                    }
                    this._listWatcher = [];
                } catch (e) {
                    // ignore
                }
            }

            if (this._languageServerProcess) {
                try {
                    this._languageServerProcess.kill();
                } catch (error) {
                    Logger.debugLog(error);
                }
                this._languageServerProcess = null;
            }

            if (this._transportServer) {
                await new Promise<void>((resolve) => {
                    try {
                        this._transportServer.close(() => resolve());
                    } catch (error) {
                        Logger.debugLog(error);
                        resolve();
                    }
                });
                this._transportServer = null;
            }

            this._launch4D();
        } finally {
            this._isRestarting = false;
        }
    }

    // Add a debounced restart method for file watchers
    private _debouncedRestart() {
        if (this._restartDebounceTimer) {
            clearTimeout(this._restartDebounceTimer);
        }
        this._restartDebounceTimer = setTimeout(async () => {
            this._restartDebounceTimer = null;
            await this.restart();
        }, 500); // 500ms debounce
    }
}

export interface Disposable {
    dispose(): void;
}

