/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import * as net from 'net'
import { ChildProcess, spawn } from 'mz/child_process'

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	SocketTransport,
	StreamInfo,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
	let sockectTransport : SocketTransport = {
		kind : TransportKind.socket,
		port : 1500
	}
	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
    const serverOptions = () =>
        new Promise<ChildProcess | StreamInfo>((resolve, reject) => {
            // Use a TCP socket because of problems with blocking STDIO
            const server = net.createServer(socket => {
                // 'connection' listener
                console.log('4D process connected')
                socket.on('end', () => {
                    console.log('4D process disconnected')
                })
                server.close()
                resolve({ reader: socket, writer: socket })
            })
            // Listen on random port
            server.listen(1800, '127.0.0.1', () => {
				console.log("Listens")
				/*
                // The server is implemented in 4D
                const childProcess = spawn(executablePath, [
                    context.asAbsolutePath(
                        path.join('vendor', 'felixfbecker', 'language-server', 'bin', '4D-language-server.4D')
                    ),
                    '--tcp=127.0.0.1:' + server.address().port,
                    '--memory-limit=' + memoryLimit,
                ])
                childProcess.stderr.on('data', (chunk: Buffer) => {
                    const str = chunk.toString()
                    console.log('4D Language Server:', str)
                    client.outputChannel.appendLine(str)
                })
                // childProcess.stdout.on('data', (chunk: Buffer) => {
                //     console.log('4D Language Server:', chunk + '');
                // });
                childProcess.on('exit', (code, signal) => {
                    client.outputChannel.appendLine(
                        `Language server exited ` + (signal ? `from signal ${signal}` : `with exit code ${code}`)
                    )
                    if (code !== 0) {
                        client.outputChannel.show()
                    }
                })
                return childProcess*/
            })
			
        })

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: '4d' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.4dm')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'languageServerExample',
		'Language Server Example',
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
