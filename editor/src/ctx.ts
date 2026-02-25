import * as vscode from 'vscode';
import * as Commands from "./commands";
import { Config } from "./config";
import { LabeledVersion } from './labeledVersion';
import { ResultUpdate } from "./tool4D/toolPreparator";
import { LanguageClient } from 'vscode-languageclient/node';
import { Logger } from "./logger";
import { LanguageServerManager } from './managers/LanguageServerManager';
import { DependencyManager } from './managers/DependencyManager';
import { Tool4DManager } from './managers/Tool4DManager';

export type CommandCallback = {
    call: (ctx: Ctx) => Commands.Cmd;
};

export class Ctx {
    private _extensionContext: vscode.ExtensionContext;
    private _commands: Record<string, CommandCallback>;
    private _config: Config;
    private _tool4DManager: Tool4DManager;
    private _lspManager: LanguageServerManager;
    private _dependencyManager: DependencyManager;
    private _restartDebounceTimer: NodeJS.Timeout | null = null;

    constructor(ctx: vscode.ExtensionContext) {
        this._extensionContext = ctx;
        this._commands = {};
        this._config = null;
    }

    public get config(): Config {
        return this._config;
    }

    public get extensionContext(): vscode.ExtensionContext {
        return this._extensionContext;
    }

    public get client(): LanguageClient {
        return this._lspManager?.client;
    }

    public async prepareTool4D(inVersion: string, inLocation: string, inChannel: string): Promise<ResultUpdate> {
        return this._tool4DManager.prepareTool4D(inVersion, inLocation, inChannel);
    }

    public async cleanUnusedToolVersions() {
        return this._tool4DManager.cleanUnusedToolVersions();
    }

    public async downloadLastTool4D(): Promise<ResultUpdate> {
        return this._tool4DManager.downloadLastTool4D();
    }

    public get4DVersion(): LabeledVersion {
        return this._tool4DManager.get4DVersion();
    }

    public async prepare_database(DBID: string, callback: (success: boolean) => void) {
        return this._dependencyManager.prepare_database(this._lspManager.client, DBID, callback);
    }

    private _initManagers() {
        this._tool4DManager = new Tool4DManager(
            this._config,
            this._extensionContext.globalStorageUri.fsPath
        );

        this._dependencyManager = new DependencyManager(
            this._extensionContext,
            this._tool4DManager.get4DVersion()
        );

        this._lspManager = new LanguageServerManager(
            this._config
        );
    }

    private _onClientCreated = (client: LanguageClient) => {
        this._dependencyManager.registerNotificationHandlers(client, () => this._debouncedRestart());
    };

    private _onBeforeRestart = () => {
        this._dependencyManager.disposeWatchers();
    };

    private _debouncedRestart() {
        if (this._restartDebounceTimer) {
            clearTimeout(this._restartDebounceTimer);
        }
        this._restartDebounceTimer = setTimeout(async () => {
            this._restartDebounceTimer = null;
            await this.restart();
        }, 500);
    }

    public start() {
        this._config = new Config(this._extensionContext);
        this._initManagers();
        this._config.init(this);

        if (this._config.IsTool4DEnabled()) {
            this._tool4DManager.prepareTool4D(this._config.tool4DWanted(), this._config.tool4DLocation(), this._config.tool4DDownloadChannel())
                .then(result => {
                    Logger.debugLog("PATH ", result.path);

                    this._config.setTool4DPath(result.path);
                    this._lspManager.launch(this._onClientCreated);
                })
                .catch((error: Error) => {
                    const userResponse = vscode.window.showErrorMessage(
                        error.message
                    );
                });
        }
        else {
            this._lspManager.launch(this._onClientCreated);
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
        return this._lspManager?.stop();
    }

    async restart() {
        return this._lspManager?.restart(this._onBeforeRestart, this._onClientCreated);
    }

    public async sendCommandToLSP<T = any>(command: string, uri: string, params?: any): Promise<T> {
        return this._lspManager.sendCommandToLSP<T>(command, uri, params);
    }
}

export interface Disposable {
    dispose(): void;
}

