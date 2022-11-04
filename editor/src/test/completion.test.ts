/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, setTestContent, setContentAtpos } from './helper';

suite('Completion', () => {
	const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_completion.4dm');

	test('Completion', async () => {
		await testCompletion(docUri);
	});
});



async function testCompletion(docUri: vscode.Uri) {

	const pos = new vscode.Position(6,0);
	await activate(docUri);

	const completionList = (await vscode.commands.executeCommand(
		'vscode.executeCompletionItemProvider ',
		docUri,
		new vscode.Position(pos.line, 1)
	)) as vscode.CompletionList;
	assert(completionList.items.length > 0);
	
} 