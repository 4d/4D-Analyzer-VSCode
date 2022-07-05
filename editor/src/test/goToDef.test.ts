/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, setTestContent, setContentAtpos } from './helper';

suite('Go To Def', () => {
	const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_goToDef_1.4dm');

	test('Go To Def', async () => {
		await testGoToDef(docUri);
	});
});



async function testGoToDef(docUri: vscode.Uri) {

	let pos = new vscode.Position(2,0)

	await activate(docUri);
	await setContentAtpos("__method_goToDef_1()", pos);

	const definition = (await vscode.commands.executeCommand(
		'vscode.provideDefinition',
		docUri,
		pos
	)) as vscode.Definition
	assert(definition)
	
} 
