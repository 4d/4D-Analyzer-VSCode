import * as vscode from 'vscode';
import * as Commands from "./commands";
import {Config} from "./config";
import {
    DiagnosticProviderMiddleware,
	LanguageClient,
	LanguageClientOptions,
	ProvideWorkspaceDiagnosticSignature,
	StreamInfo,
    WorkspaceDiagnosticRequest,
    WorkspaceDiagnosticReport,
    vsdiag,
    TextDocumentIdentifier,
} from 'vscode-languageclient/node';

import * as ls from 'vscode-languageserver-protocol';
import { workspace } from 'vscode';
import * as child_process from 'child_process';
import * as net from 'net';
import { checkSyntax } from "./lsp_ext";


export type CommandCallback = {
    call: (ctx: Ctx) => Commands.Cmd;
};

export class Ctx
{
    private _client : LanguageClient;
    private _extensionContext : vscode.ExtensionContext;
    private _commands : Record<string, CommandCallback>;
    private _config : Config;

    constructor(ctx : vscode.ExtensionContext) {
        this._client = null;
        this._extensionContext = ctx;
        this._commands = {};
        this._config = null;
    }

    public get extensionContext() : vscode.ExtensionContext
    {
        return this._extensionContext;
    }

    public get client() : LanguageClient
    {
        return this._client;
    }

    public set client(inClient : LanguageClient) {
        this._client = inClient;
    }

    private _getServerPath(config : Config, isDebug : boolean) : string {
        let serverPath : string = this._config.serverPath;

        if(process.env.ANALYZER_4D_PATH)
        {
            serverPath = process.env.ANALYZER_4D_PATH;
        }
    
        if(isDebug) {
            serverPath = '';//debug
        }

        return serverPath;
    }

    private _getPort(config : Config, isDebug : boolean) : number {
        let port = 0;
        if(process.env.ANALYZER_4D_PORT)
        {
            port = parseInt(process.env.ANALYZER_4D_PORT);
        }

        if(isDebug) {
            port = 1800;
        }

        return port;
    }

    public start()
    {
        const client = this._client;
        this._config = new Config(this._extensionContext);
        this._config.checkSettings();
        let isDebug : boolean;
        isDebug = false;
        if(process.env.ANALYZER_4D_DEBUG)
        {
            isDebug = true;
        }
    
        const serverPath : string = this._getServerPath(this._config, isDebug);
        const port : number= this._getPort(this._config, isDebug);

        console.log("SERVER PATH", serverPath);
    
        // If the extension is launched in debug mode then the debug server options are used
        // Otherwise the run options are used
        const serverOptions = () =>
            new Promise<child_process.ChildProcess | StreamInfo>((resolve, reject) => {
                // Use a TCP socket because of problems with blocking STDIO
                const server = net.createServer(socket => {
                    // 'connection' listener
                    console.log('4D process connected');
                    socket.on('end', () => {
                        console.log('4D process disconnected');
                        server.close();
                    });
                    socket.on('close', () => {
                        console.log('4D process disconnected');
                        server.close();
                    });
                    socket.on('error', (e) => {
                        console.log(e);
                        server.close();
                    });
                    //server.close()
                    resolve({ reader: socket, writer: socket, detached : false });
                });
    
                // Listen on random port
                server.listen(port, '127.0.0.1', () => {
                    console.log(`Listens on port: ${(server.address() as net.AddressInfo).port}`);
                    
                    if(serverPath != '') {
                        const childProcess = child_process.spawn(serverPath, [
                            '--lsp=' + (server.address() as net.AddressInfo).port,
                        ]);
    
                        childProcess.stderr.on('data', (chunk: Buffer) => {
                            const str = chunk.toString();
                            console.log('4D Language Server:', str);
                            this._client.outputChannel.appendLine(str);
                        });
    
                        childProcess.on('exit', (code, signal) => {
                            this._client.outputChannel.appendLine(
                                `Language server exited ` + (signal ? `from signal ${signal}` : `with exit code ${code}`)
                            );
                            if (code !== 0) {
                                this._client.outputChannel.show();
                            }
                        });
    
    
                        server.on('close', function() {
                            console.log("KILL");
                            childProcess.kill();
                        });
    
                        return childProcess;
                    }
                   
                });
            });
        const provideWorkspaceDiagnostics = (resultIds : vsdiag.PreviousResultId[], token, resultReporter): vscode.ProviderResult<vsdiag.WorkspaceDiagnosticReport> => {
                const provideWorkspaceDiagnostics: ProvideWorkspaceDiagnosticSignature = (resultIds :vsdiag.PreviousResultId[], token): vscode.ProviderResult<vsdiag.WorkspaceDiagnosticReport> => {
                  const partialResultToken = uuid();
                  const disposable = this.client.onProgress(WorkspaceDiagnosticRequest.partialResult, partialResultToken, partialResult => {
                    if (partialResult == undefined) {
                      resultReporter(null);
                      return;
                    }
                    resultReporter(partialResult as ls.WorkspaceDiagnosticReportPartialResult);
                  });
                  let uri : TextDocumentIdentifier = null;
                  if(vscode.window.activeTextEditor.document)
                  {
                    uri = client.code2ProtocolConverter.asTextDocumentIdentifier(
                        vscode.window.activeTextEditor.document
                    );
                  }
                  const params: ls.WorkspaceDiagnosticParams & { uri?: TextDocumentIdentifier } = {
                    identifier: "this.options.identifier",
                    previousResultIds: [],
                    partialResultToken,
                    uri
                  };
                  return this.client.sendRequest(WorkspaceDiagnosticRequest.type, params, token).then(async (result): Promise<vsdiag.WorkspaceDiagnosticReport> => {
                    resultReporter(result);
                    return { items: [] };
                  }).finally(() => {
                    disposable.dispose();
                  });
                };
                const middleware: DiagnosticProviderMiddleware = this.client.middleware!;
                return middleware.provideWorkspaceDiagnostics
                  ? middleware.provideWorkspaceDiagnostics(resultIds, token, resultReporter, provideWorkspaceDiagnostics)
                  : provideWorkspaceDiagnostics(resultIds, token, resultReporter);
              };
    
            // Options to control the language client
            const clientOptions: LanguageClientOptions = {
                // Register the server for plain text documents
                documentSelector: [{ scheme: 'file', language: '4d' }],
                synchronize: {
                    // Notify the server about file changes to '.clientrc files contained in the workspace
                    fileEvents: workspace.createFileSystemWatcher('**/.4DSettings')
                },
                initializationOptions: this._config.cfg,
                diagnosticCollectionName:"4d"
            };
        // Create the language client and start the client.
        this._client = new LanguageClient(
            '4D-Analyzer',
            '4D-LSP',
            serverOptions,
            clientOptions
        );

        this._client.start();
    }

    public registerCommands()
    {
        this._commands = {
            filesStatus:{call:Commands.filesStatus},
            checkSyntax:{call:Commands.checkSyntax}
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

    stop() : undefined | Promise<void>
    {
        if (!this._client) {
            return undefined;
        }
    
        return this._client.stop();
    }
}

export interface Disposable {
    dispose(): void;
}

function uuid() : string{
    return "";
}
