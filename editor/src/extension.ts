/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { workspace, ExtensionContext } from 'vscode';
import * as net from 'net'
import {Config} from "./config"
import * as child_process from 'child_process'
import * as vscode from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	StreamInfo
} from 'vscode-languageclient/node';

let client: LanguageClient;
let config : Config

export function activate(context: ExtensionContext) {
	
	//console.log(env)
	config = new Config(context);

	let serverPath : string = config.serverPath

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: '4d' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.4DSettings')
		}
	};
	let isDebug = false;
	let port = 0;
	if(process.env.ANALYZER_4D_PORT)
	{
		port = parseInt(process.env.ANALYZER_4D_PORT);
	}
	if(process.env.ANALYZER_4D_PATH)
	{
		serverPath = process.env.ANALYZER_4D_PATH;
	}

	if(process.env.ANALYZER_4D_DEBUG)
	{
		isDebug = true;
	}
	
	if(isDebug) {
		serverPath = ''//debug
		port = 1800;
	}
	console.log("SERVER PATH", serverPath)

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
    const serverOptions = () =>
        new Promise<child_process.ChildProcess | StreamInfo>((resolve, reject) => {
            // Use a TCP socket because of problems with blocking STDIO
            const server = net.createServer(socket => {
                // 'connection' listener
                console.log('4D process connected')
                socket.on('end', () => {
                    console.log('4D process disconnected')
					server.close()
                })
				socket.on('close', () => {
                    console.log('4D process disconnected')
					server.close()
                })
				socket.on('error', (e) => {
                    console.log(e)
					server.close()
                })
                //server.close()
                resolve({ reader: socket, writer: socket, detached : false })
            })


            // Listen on random port
            server.listen(port, '127.0.0.1', () => {
				console.log(`Listens on port: ${(server.address() as net.AddressInfo).port}`)
				
				if(serverPath != '') {
					 const childProcess = child_process.spawn(serverPath, [
						'--lsp=' + (server.address() as net.AddressInfo).port,
					])

					childProcess.stderr.on('data', (chunk: Buffer) => {
						const str = chunk.toString()
						console.log('4D Language Server:', str)
						client.outputChannel.appendLine(str)
					})

					childProcess.on('exit', (code, signal) => {
						client.outputChannel.appendLine(
							`Language server exited ` + (signal ? `from signal ${signal}` : `with exit code ${code}`)
						)
						if (code !== 0) {
							client.outputChannel.show()
						}
					})

					function cleanUpServer(signal) {
						server.close();
						console.log("CLOSE SERVER")
					}
					let array = ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'uncaughtException', 'SIGTERM'];
					array.forEach((eventType) => {
						process.on(eventType, cleanUpServer.bind(eventType));
					  })

					server.on('close', function() {
						console.log("KILL")
						childProcess.kill()
					});

					return childProcess
				}
               
            })
        })



	// Create the language client and start the client.
	client = new LanguageClient(
		'4D-Analyzer',
		'4D-LSP',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}

	return client.stop();
}
