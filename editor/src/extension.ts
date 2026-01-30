/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { ExtensionContext } from 'vscode';
import { Ctx } from './ctx';
import { Logger } from './logger';

/**
 * API exposed to other extensions
 */
export interface ExtensionAPI {
	/**
	 * Send a command to the LSP server and receive a response
	 * @param command The command name to send
	 * @param params The parameters object to send with the command
	 * @returns A promise that resolves with the response from the LSP server
	 */
	sendCommand<T = any>(command: string, params?: any): Promise<T>;

	//initialize the loading of a database
	init(db_id : string): Promise<boolean>;

}


let ctx: Ctx;
export function activate(context: ExtensionContext): ExtensionAPI {
	ctx = new Ctx(context);
	ctx.start();

	ctx.registerCommands();

	// Return API for other extensions
	return {
		sendCommand: async <T = any>(command: string, params?: any): Promise<T> => {
			Logger.debugLog("Send message");
			return ctx.sendCommandToLSP<T>(command, params);
		},
		init: async (projectID): Promise<boolean> => {
			return new Promise<boolean>((resolve) => {
				ctx.prepare_database(projectID, (success: boolean) => {
					resolve(success);
				});
			});
		}
	};
}
export function deactivate(): Thenable<void> | undefined {
	return ctx.stop();
}
