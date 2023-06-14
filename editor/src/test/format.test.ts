
import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Format', () => {
	const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_completion.4dm');

	test('Format', async () => {
		await testFormat(docUri);
	});
    test('FormatRange', async () => {
		await testFormatRange(docUri);
	});
});



async function testFormat(docUri: vscode.Uri) {

	await activate(docUri);

	const textEditList = (await vscode.commands.executeCommand(
		'vscode.executeFormatDocumentProvider',
		docUri
	)) as vscode.CompletionList;
	assert(textEditList.items.length > 0);
	
} 

async function testFormatRange(docUri: vscode.Uri) {

	await activate(docUri);

	const textEditList = (await vscode.commands.executeCommand(
		'vscode.executeFormatRangeProvide',
		docUri,
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0))
	)) as vscode.CompletionList;
	assert(textEditList.items.length > 0);
	
} 