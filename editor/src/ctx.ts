import * as vscode from 'vscode';
import * as Commands from "./commands";
import {Config} from "./config";
import {
	LanguageClient,
	LanguageClientOptions,
	StreamInfo
} from 'vscode-languageclient/node';

import { workspace } from 'vscode';
import * as child_process from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream, createWriteStream } from "fs";

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
        
        if(process.env.ANALYZER_4D_PATH) {
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

    private _download(url : string, filePath : string) : Promise<string> 
    {
        const http = require('http');
        const https = require('https');

        async function download(url, filePath) : Promise<string>{
            const proto = !url.charAt(4).localeCompare('s') ? https : http;
          
            return new Promise((resolve, reject) => {

          
              const request = proto.get(url, response => {
                if(response.statusCode == 302)
                {
                    download(response.headers.location, filePath).then(r => {
                        resolve(r);
                    })
                }
                else if (response.statusCode === 200) {
                    const file = fs.createWriteStream(filePath);
                    let fileInfo = null;

                    fileInfo = {
                        mime: response.headers['content-type'],
                        size: parseInt(response.headers['content-length'], 10),
                      };
                
                    response.pipe(file);

                    // The destination stream is ended by the time it's called
                    file.on('finish', () => resolve(fileInfo));
                        
                    request.on('error', err => {
                      fs.unlink(filePath, () => reject(err));
                    });
                
                    file.on('error', err => {
                      fs.unlink(filePath, () => reject(err));
                    });
          
                }
                else if (response.statusCode !== 200) {
                  fs.unlink(filePath, () => {
                    reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                  });
                  return;
                }
                request.end();

              });
            });
        }
        return new Promise((resolve, reject) => {
            download(url, filePath).then((p)=> {
                resolve(p)
            }).catch(e=> {
                reject(e);
            })
        }); 
    }

    private _getURLTool4D() : string | undefined {
        const type = os.type();
        let url="https://resources-download.4d.com/release/20.x/20/"
        url+="100174/";
        if(type == "Linux")
        {
            return undefined;
        }
        else if(type == "Darwin")
        {
            const arch = os.arch();
            url+="mac/tool4d_v20.0_mac";
            if(arch === "arm" || arch === "arm64")
                url+="_arm";
            else
                url+="_x86";

            url+=".tar.xz"
        }
        else if(type == "Windows_NT")
        {
            url+="win/tool4d_v20.0_win.tar.xz"
        }
        console.log("Download", url)
        return url;
    }

    private async _decompress(input : string, inDirectory : string) : Promise<void> {
        return new Promise(async (resolve, reject)=> {
        if(!existsSync(input))
            reject();
        console.log("Untar", input)
        const childProcess = child_process.spawn("tar", [
            '-xf', input, '-C', inDirectory
        ]);

        childProcess.stderr.on('data', (chunk: Buffer) => {
            //const str = chunk.toString();
            //console.log('4D Language Server:', str);
            //this._client.outputChannel.appendLine(str);
        });

        childProcess.on('exit', (code, signal) => {
            if(code == 0)
            {
                resolve()
            }
            else
            {
                reject()
            }
        });
        
        });
    }

    public async prepareTool4D() : Promise<string>
    {
        return new Promise(async (resolve, reject)=> {

            const globalStoragePath = this.extensionContext.globalStorageUri.fsPath;
            
            if (!existsSync(globalStoragePath)) {
                mkdirSync(globalStoragePath);
            }
            const zipPath = path.join(globalStoragePath, "tool4d.tar.xz")
            const tool4D = path.join(globalStoragePath, "tool4d")
            let tool4DExecutable = "";
            const osType = os.type();
            if(osType === "Windows_NT")
            {
                tool4DExecutable = path.join(tool4D, "tool4d.exe");
            }
            else if(osType == "Darwin")
            {
                tool4DExecutable = path.join(tool4D, "tool4d.app");
            }
            else
            {
                tool4DExecutable = path.join(tool4D, "tool4d");
            }
            
            if(!existsSync(tool4D))
            {
                const url : string = this._getURLTool4D();
                console.log(url);

                if(url)
                {
                    if(!existsSync(zipPath))
                    {
                        console.log("Download", url)
                        await this._download(url, zipPath);
                    }
                }

                this._decompress(zipPath, globalStoragePath).then(()=> {
                    resolve(tool4DExecutable);
                })
                .catch(()=> {
                    reject();
                })
            }
            else
            {
                resolve(tool4DExecutable);
            }
        })
    }

    private _launch4D() {
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

    public start()
    {
        this._config = new Config(this._extensionContext);
        if(this._config.shouldPrepareTool4D()) {
            this.prepareTool4D().then(path => {
                this._config.setTool4DPath(path);
                this._launch4D();
            })
        }
        else {
            this._launch4D();
        }
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
