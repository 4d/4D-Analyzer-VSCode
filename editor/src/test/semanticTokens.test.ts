/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Semantic tokens', () => {
	const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_to_test_semantic_token.4dm');

	test('Semantic tokens', async () => {
		await testDiagnostics(docUri, [
			{ message: 'ANY is all uppercase.', range: toRange(0, 0, 0, 3), severity: vscode.DiagnosticSeverity.Warning, source: 'ex' },
			{ message: 'ANY is all uppercase.', range: toRange(0, 14, 0, 17), severity: vscode.DiagnosticSeverity.Warning, source: 'ex' },
			{ message: 'OS is all uppercase.', range: toRange(0, 18, 0, 20), severity: vscode.DiagnosticSeverity.Warning, source: 'ex' }
		]);
	});
});

function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
	const start = new vscode.Position(sLine, sChar);
	const end = new vscode.Position(eLine, eChar);
	return new vscode.Range(start, end);
}

async function testDiagnostics(docUri: vscode.Uri, expectedDiagnostics: vscode.Diagnostic[]) {

	await activate(docUri);
	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const semanticTokens = (await vscode.commands.executeCommand(
		'vscode.provideDocumentSemanticTokens',
		docUri
	)) as vscode.SemanticTokens
	console.log(semanticTokens)
	assert(semanticTokens.data.length > 0)
	
} 
