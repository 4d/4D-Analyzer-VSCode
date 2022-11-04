
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from "fs";
export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;
export let isExeLaunched = false;

/**
 * Activates the vscode.lsp-sample extension
 */
export async function activate(docUri: vscode.Uri, inFolder? : vscode.Uri) {
	// The extensionId is `publisher.name` from package.json
	const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
	await ext.activate();
	try {
		if(inFolder && fs.lstatSync(inFolder.fsPath).isDirectory()) {
			await vscode.commands.executeCommand( 'vscode.openFolder', inFolder, false );
		}
		
		doc = await vscode.workspace.openTextDocument(docUri);
		editor = await vscode.window.showTextDocument(doc);
		
		if(isExeLaunched)
			await sleep(1000); // Wait for server activation
		else
			await sleep(5000); // Wait for server activation


		isExeLaunched = true;
	} catch (e) {
		console.error(e);
	}
}

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const getDocPath = (p: string) => {
	return path.resolve(__dirname, '../../testFixture', p);
};
export const getDocUri = (p: string) => {
	return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(content: string): Promise<boolean> {
	const all = new vscode.Range(
		doc.positionAt(0),
		doc.positionAt(doc.getText().length)
	);
	return editor.edit(eb => eb.replace(all, content));
}

export async function setContentAtpos(content: string, inPosition : vscode.Position): Promise<boolean> {
	return editor.edit(eb => eb.insert(inPosition, content));
}

