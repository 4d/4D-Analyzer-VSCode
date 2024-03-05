
import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Completion', () => {
	const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_completion.4dm');

	test('Completion', async () => {
		await testCompletion(docUri);
	});
});



async function testCompletion(docUri: vscode.Uri) {

	await activate(docUri);

	const pos = new vscode.Position(6,0);
	const completionList = (await vscode.commands.executeCommand(
		'vscode.executeCompletionItemProvider',
		docUri,
		new vscode.Position(pos.line, pos.character)
	)) as vscode.CompletionList;
	assert(completionList.items.length > 0);
	
} 