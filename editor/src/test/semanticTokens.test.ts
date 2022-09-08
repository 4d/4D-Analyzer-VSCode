/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Semantic tokens', () => {
	const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_to_test_semantic_token.4dm');
	const folder = getDocUri('LanguageServerProtocol/Project/Sources/');

	test('Semantic tokens File', async () => {
		await testSemanticFile(docUri);
	});
	test('Semantic tokens Folder', async () => {
		await testSemanticFolder(docUri, folder);
	});
});



async function testSemanticFile(docUri: vscode.Uri) {

	await activate(docUri);
	
	const semanticTokens = (await vscode.commands.executeCommand(
		'vscode.provideDocumentSemanticTokens',
		docUri
	)) as vscode.SemanticTokens
	assert(semanticTokens.data.length > 0)
	
} 

async function testSemanticFolder(docUri: vscode.Uri, inFolder: vscode.Uri) {

	await activate(docUri, inFolder);

	const semanticTokens = (await vscode.commands.executeCommand(
		'vscode.provideDocumentSemanticTokens',
		docUri
	)) as vscode.SemanticTokens
	assert(semanticTokens.data.length > 0)
	
} 
