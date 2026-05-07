import * as child_process from 'child_process';
import * as net from 'net';
import {
    LanguageClient,
    LanguageClientOptions,
    StreamInfo,
} from 'vscode-languageclient/node';
import { workspace } from 'vscode';
import { Config } from "../config";
import { Logger } from "../logger";

class ManagedLanguageClient extends LanguageClient {
    constructor(
        id: string,
        name: string,
        serverOptions: () => Promise<child_process.ChildProcess | StreamInfo>,
        clientOptions: LanguageClientOptions,
        private readonly shouldSuppressCloseHandling: () => boolean
    ) {
        super(id, name, serverOptions, clientOptions);
    }

    protected async handleConnectionClosed(): Promise<void> {
        if (this.shouldSuppressCloseHandling()) {
            return;
        }

        await super.handleConnectionClosed();
    }
}

export class LanguageServerManager {

    private _client: LanguageClient = null;
    private _transportServer: net.Server | null = null;
    private _languageServerProcess: child_process.ChildProcess | null = null;
    private _isRestarting = false;
    private _isIntentionalShutdown = false;

    constructor(
        private _config: Config
    ) {}

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

    public launch(onClientCreated?: (client: LanguageClient) => void): void {
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
        this._client = new ManagedLanguageClient(
            '4D-Analyzer',
            '4D-LSP',
            serverOptions,
            clientOptions,
            () => this._isIntentionalShutdown
        );

        onClientCreated?.(this._client);
        this._client.start();
    }

    public stop(): undefined | Promise<void> {
        if (!this._client) {
            return undefined;
        }

        this._isIntentionalShutdown = true;
        return this._client.stop().finally(() => {
            this._isIntentionalShutdown = false;
        });
    }

    public async restart(onBeforeRestart?: () => void, onClientCreated?: (client: LanguageClient) => void): Promise<void> {
        // Prevent multiple concurrent restarts
        if (this._isRestarting) {
            return;
        }
        this._isRestarting = true;
        this._isIntentionalShutdown = true;

        try {
            if (this._client) {
                try {
                    const stopPromise = this._client.stop();
                    if (stopPromise) {
                        await stopPromise;
                    }
                    this._client.dispose();
                    this._client = null;
                    onBeforeRestart?.();
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

            this.launch(onClientCreated);
        } finally {
            this._isIntentionalShutdown = false;
            this._isRestarting = false;
        }
    }

    /**
     * Send a command to the LSP server and receive a response
     * This method is used by other extensions to communicate with the LSP server
     * @param command The command name/method to send to the LSP server
     * @param params The parameters to send with the command
     * @returns A promise that resolves with the response from the LSP server
     */
    public async sendCommandToLSP<T = any>(command: string, uri: string, params?: any): Promise<T> {
        if (!this._client) {
            throw new Error('Language client is not initialized');
        }

        if (!this._client.isRunning()) {
            throw new Error('Language client is not running');
        }

        try {
            const response = await this._client.sendRequest<T>(command, { uri: uri, params: params });
            return response;
        } catch (error) {
            Logger.debugLog(`Error sending command '${command}' to LSP: ${error}`);
            throw error;
        }
    }
}
