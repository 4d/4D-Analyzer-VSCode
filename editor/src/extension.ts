/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { ExtensionContext } from 'vscode';
import { Ctx } from './ctx';


let ctx : Ctx;
export function activate(context: ExtensionContext) {
	ctx = new Ctx(context);
	ctx.start();

	ctx.registerCommands();
}

export function deactivate(): Thenable<void> | undefined {
	return ctx.stop();
}
