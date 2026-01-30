
import * as vscode from 'vscode';
import assert from "assert";
import { getDocUri } from './helper';

suite('Dependencies', () => {
    const docUri = getDocUri('LanguageServerProtocol/Project/LanguageServerProtocol.4DProject');

    test('List Dependencies', async () => {
        await testListDepencies(docUri);
    });
});



async function testListDepencies(docUri: vscode.Uri) {
    const path = docUri.toString();
    const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
    const api = await ext.activate();
    await api.init(path);
    const list = await api.sendCommand("dependency/componentsLoaded", {uri : path});
    assert(list.components.length > 0);
} 
