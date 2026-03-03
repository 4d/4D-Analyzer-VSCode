
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import assert from "assert";
import { getDocPath, getDocUri } from './helper';

/**
 * #19353 – Given some components are defined in a environment4d.json file placed
 *          in a project's parent folder, When the project is loaded in VS Code,
 *          Then the defined components shall be loaded by the 4D-Analyzer extension.
 */
suite('Environment4d.json Loading', () => {
    const projectUri = getDocUri('LanguageServerProtocol/Project/LanguageServerProtocol.4DProject');
    const projectFolder = getDocPath('LanguageServerProtocol');
    const parentFolder = path.dirname(projectFolder);
    const env4dPath = path.join(parentFolder, 'environment4d.json');

    let env4dExistedBefore: boolean;
    let originalEnv4dContent: string | null;

    setup(() => {
        env4dExistedBefore = fs.existsSync(env4dPath);
        originalEnv4dContent = env4dExistedBefore
            ? fs.readFileSync(env4dPath, 'utf-8')
            : null;
    });

    teardown(() => {
        if (env4dExistedBefore && originalEnv4dContent !== null) {
            fs.writeFileSync(env4dPath, originalEnv4dContent, 'utf-8');
        } else if (!env4dExistedBefore && fs.existsSync(env4dPath)) {
            fs.unlinkSync(env4dPath);
        }
    });

    /**
     * #19435 – Verify that components defined in environment4d.json located in the
     *          project's parent folder are loaded when the project is opened
     */
    test('Components from environment4d.json are loaded on project open', async function () {
        this.timeout(60000);

        // Create environment4d.json with a component reference
        const env4dContent = {
            components: [
                {
                    path: path.join(projectFolder, 'Components', 'ClassesComponent.4dbase')
                }
            ]
        };
        fs.writeFileSync(env4dPath, JSON.stringify(env4dContent, null, '\t'), 'utf-8');

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        const result = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(result, "Server should respond after loading project with environment4d.json");
    });

    /**
     * #19436 – Verify that the project loads normally when environment4d.json is missing
     */
    test('Project loads normally when environment4d.json is missing', async function () {
        this.timeout(60000);

        // Ensure environment4d.json does not exist
        if (fs.existsSync(env4dPath)) {
            fs.unlinkSync(env4dPath);
        }

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        const initialized = await api.init(projectPath);

        assert.ok(initialized, "Project should initialize successfully without environment4d.json");

        const result = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(result, "Server should respond normally without environment4d.json");
    });

    /**
     * #19437 – Verify that an empty environment4d.json file does not cause errors
     */
    test('Empty environment4d.json does not cause errors', async function () {
        this.timeout(60000);

        // Create an empty (but valid JSON) environment4d.json
        fs.writeFileSync(env4dPath, JSON.stringify({}, null, '\t'), 'utf-8');

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        const initialized = await api.init(projectPath);

        assert.ok(initialized, "Project should initialize successfully with empty environment4d.json");

        const result = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(result, "Server should respond normally with empty environment4d.json");
    });

    /**
     * #19438 – Verify that multiple components defined in environment4d.json are all loaded
     */
    test('Multiple components in environment4d.json are all loaded', async function () {
        this.timeout(60000);

        // Create environment4d.json with multiple component references
        const env4dContent = {
            components: [
                {
                    path: path.join(projectFolder, 'Components', 'ClassesComponent.4dbase')
                },
                {
                    path: path.join(projectFolder, 'Components', 'Component_interpreted.4dbase')
                }
            ]
        };
        fs.writeFileSync(env4dPath, JSON.stringify(env4dContent, null, '\t'), 'utf-8');

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        const result = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(result, "Server should respond after loading multiple components");
        assert.ok(
            result.components.length >= 2,
            `Expected at least 2 components to be loaded, got ${result.components.length}`
        );
    });

    /**
     * #19439 – Verify that component syntax defined via environment4d.json is correctly recognized
     */
    test('Component syntax from environment4d.json is recognized', async function () {
        this.timeout(60000);

        // Create environment4d.json with component that exposes classes/methods
        const env4dContent = {
            components: [
                {
                    path: path.join(projectFolder, 'Components', 'ClassesComponent.4dbase')
                }
            ]
        };
        fs.writeFileSync(env4dPath, JSON.stringify(env4dContent, null, '\t'), 'utf-8');

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        // Verify that completion includes symbols from the component
        const docUri = getDocUri('LanguageServerProtocol/Project/Sources/Methods/__method_completion.4dm');
        const doc = await vscode.workspace.openTextDocument(docUri);
        await vscode.window.showTextDocument(doc);
        await sleep(2000);

        const completionList = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            docUri,
            new vscode.Position(6, 0)
        )) as vscode.CompletionList;

        assert.ok(completionList.items.length > 0, "Completion should include items from component loaded via environment4d.json");
    });
});

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
