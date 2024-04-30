
import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Semantic tokens', () => {
	const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_semantic_token.4dm');

	test('Semantic tokens File', async () => {
		await testSemanticFile(docUri);
	});
});



async function testSemanticFile(docUri: vscode.Uri) {

	await activate(docUri);
	
	const semanticTokens = (await vscode.commands.executeCommand(
		'vscode.provideDocumentSemanticTokens',
		docUri
	)) as vscode.SemanticTokens;
	assert(semanticTokens.data.length > 0);
	
} 

