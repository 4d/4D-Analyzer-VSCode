
import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Format', () => {
	const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_formatting.4dm');

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
		docUri,
		{tabSize: 4, insertSpaces: false}
	)) as vscode.TextEdit[];
	assert(textEditList.length > 0);
	
} 

async function testFormatRange(docUri: vscode.Uri) {

	await activate(docUri);

	const textEditList = (await vscode.commands.executeCommand(
		'vscode.executeFormatRangeProvider',
		docUri,
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(10, 0)),
		{tabSize: 4, insertSpaces: false}
	)) as vscode.TextEdit[];
	assert(textEditList != undefined);
	
} 