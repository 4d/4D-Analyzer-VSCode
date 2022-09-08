
import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, setTestContent, setContentAtpos } from './helper';

suite('Signature and Hover', () => {
	const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_signatureHelp.4dm');

	test('Signature', async () => {
		await testSignature(docUri);
	});
    test('Hover', async () => {
		await testHover(docUri);
	});
});

async function testSignature(docUri: vscode.Uri) {

	await activate(docUri);
	let pos = new vscode.Position(3,23)

	const definition = (await vscode.commands.executeCommand(
		'vscode.executeSignatureHelpProvider',
		docUri,
		pos
	)) as vscode.SignatureHelp
	assert(definition.signatures.length > 0)
	
} 

async function testHover(docUri: vscode.Uri) {

	await activate(docUri);
	let pos = new vscode.Position(12,9)

	const definition = (await vscode.commands.executeCommand(
		'vscode.executeHoverProvider',
		docUri,
		pos
	)) as vscode.Hover[]

	assert(definition.length > 0)
	
} 

