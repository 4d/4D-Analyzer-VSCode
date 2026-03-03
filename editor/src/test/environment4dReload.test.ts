
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import assert from "assert";
import { getDocPath, getDocUri } from './helper';

/**
 * #19363 – Given some components are defined in a environment4d.json file placed
 *          in a project's parent folder, When this file is updated, Then the
 *          project shall be reloaded.
 */
suite('Environment4d.json Reload', () => {
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

        // Ensure environment4d.json exists for reload tests
        if (!env4dExistedBefore) {
            const initialContent = {
                components: [
                    {
                        path: path.join(projectFolder, 'Components', 'ClassesComponent.4dbase')
                    }
                ]
            };
            fs.writeFileSync(env4dPath, JSON.stringify(initialContent, null, '\t'), 'utf-8');
        }
    });

    teardown(() => {
        if (env4dExistedBefore && originalEnv4dContent !== null) {
            fs.writeFileSync(env4dPath, originalEnv4dContent, 'utf-8');
        } else if (!env4dExistedBefore && fs.existsSync(env4dPath)) {
            fs.unlinkSync(env4dPath);
        }
    });

    /**
     * #19488 – Verify that the project is automatically reloaded when environment4d.json is modified
     */
    test('Project reloads when environment4d.json is modified', async function () {
        this.timeout(60000);

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        const componentsBefore = await api.sendCommand("dependency/componentsLoaded", projectPath);

        // Modify environment4d.json
        const env4d = JSON.parse(fs.readFileSync(env4dPath, 'utf-8'));
        env4d._modified = Date.now(); // touch the file content
        fs.writeFileSync(env4dPath, JSON.stringify(env4d, null, '\t'), 'utf-8');

        // Wait for the file watcher to detect the change and trigger reload
        await sleep(5000);

        const componentsAfter = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(componentsAfter, "Server should respond after environment4d.json modification");
    });

    /**
     * #19489 – Verify that adding a new component in environment4d.json triggers a reload
     */
    test('Adding a new component in environment4d.json triggers reload', async function () {
        this.timeout(60000);

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        // Add a second component to environment4d.json
        const env4d = JSON.parse(fs.readFileSync(env4dPath, 'utf-8'));
        if (!env4d.components) env4d.components = [];
        env4d.components.push({
            path: path.join(projectFolder, 'Components', 'Component_interpreted.4dbase')
        });
        fs.writeFileSync(env4dPath, JSON.stringify(env4d, null, '\t'), 'utf-8');

        // Wait for the file watcher to detect the change
        await sleep(5000);

        const components = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(components, "Server should respond after adding a component to environment4d.json");
    });

    /**
     * #19490 – Verify that removing a component from environment4d.json triggers a reload
     */
    test('Removing a component from environment4d.json triggers reload', async function () {
        this.timeout(60000);

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        // Remove all components from environment4d.json
        const env4d = JSON.parse(fs.readFileSync(env4dPath, 'utf-8'));
        env4d.components = [];
        fs.writeFileSync(env4dPath, JSON.stringify(env4d, null, '\t'), 'utf-8');

        // Wait for the file watcher to detect the change
        await sleep(5000);

        const components = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(components, "Server should respond after removing components from environment4d.json");
    });

    /**
     * #19491 – Verify that reload is not triggered when the file contains invalid JSON
     */
    test('Reload is not triggered for invalid JSON in environment4d.json', async function () {
        this.timeout(60000);

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        const componentsBefore = await api.sendCommand("dependency/componentsLoaded", projectPath);

        // Write invalid JSON to environment4d.json
        fs.writeFileSync(env4dPath, '{ broken json !!!', 'utf-8');

        // Wait to ensure file watcher fires but reload does NOT happen
        await sleep(5000);

        // The server should still be responsive — invalid JSON should be rejected
        const componentsAfter = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(componentsAfter, "Server should still be responsive after invalid JSON in environment4d.json");
        assert.deepStrictEqual(
            componentsAfter.components?.length,
            componentsBefore.components?.length,
            "Component list should remain unchanged after invalid JSON save"
        );
    });
});

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
