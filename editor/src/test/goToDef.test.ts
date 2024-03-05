
import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, setContentAtpos } from './helper';

suite('Go To Def', () => {
	const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_goToDef_1.4dm');

	test('Definition', async () => {
		await testGoToDef(docUri);
	});
});



async function testGoToDef(docUri: vscode.Uri) {

	const pos = new vscode.Position(35,0)
	await activate(docUri);
	await setContentAtpos("__method_goToDef_1()", pos);

	const definition = (await vscode.commands.executeCommand(
		'vscode.executeDefinitionProvider',
		docUri,
		new vscode.Position(pos.line, 1)
	)) as vscode.Location[]
	assert(definition.length > 0)
	
} 
