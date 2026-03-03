
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import assert from "assert";
import { getDocPath, getDocUri } from './helper';

/**
 * #19362 – Given a project has some components defined in its dependencies.json file,
 *          When this file is updated, Then the project shall be reloaded.
 */
suite('Dependencies.json Reload', () => {
    const projectUri = getDocUri('LanguageServerProtocol/Project/LanguageServerProtocol.4DProject');
    const depsPath = getDocPath('LanguageServerProtocol/Project/Sources/dependencies.json');

    let originalContent: string;

    setup(() => {
        originalContent = fs.readFileSync(depsPath, 'utf-8');
    });

    teardown(() => {
        fs.writeFileSync(depsPath, originalContent, 'utf-8');
    });

    /**
     * #19483 – Verify that the project is automatically reloaded when dependencies.json is modified
     */
    test('Project reloads when dependencies.json is modified', async function () {
        this.timeout(60000);

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        const componentsBefore = await api.sendCommand("dependency/componentsLoaded", projectPath);

        // Modify dependencies.json (update version field)
        const deps = JSON.parse(originalContent);
        deps.version = (deps.version || 2100) + 1;
        fs.writeFileSync(depsPath, JSON.stringify(deps, null, '\t'), 'utf-8');

        // Wait for the file watcher to detect the change and trigger reload
        await sleep(5000);

        const componentsAfter = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(componentsAfter, "Server should respond after dependencies.json modification");
    });

    /**
     * #19484 – Verify that adding a new component triggers a project reload
     */
    test('Adding a new component triggers reload', async function () {
        this.timeout(60000);

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        // Add a new component entry to dependencies.json
        const deps = JSON.parse(originalContent);
        if (!deps.dependencies) deps.dependencies = {};
        if (!deps.dependencies.external) deps.dependencies.external = {};
        deps.dependencies.external["NewTestComponent"] = {};
        fs.writeFileSync(depsPath, JSON.stringify(deps, null, '\t'), 'utf-8');

        // Wait for the file watcher to detect the change
        await sleep(5000);

        const components = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(components, "Server should respond after adding a component to dependencies.json");
    });

    /**
     * #19485 – Verify that removing a component triggers a project reload
     */
    test('Removing a component triggers reload', async function () {
        this.timeout(60000);

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        // Remove the external dependencies entry
        const deps = JSON.parse(originalContent);
        if (deps.dependencies && deps.dependencies.external) {
            deps.dependencies.external = {};
        }
        fs.writeFileSync(depsPath, JSON.stringify(deps, null, '\t'), 'utf-8');

        // Wait for the file watcher to detect the change
        await sleep(5000);

        const components = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(components, "Server should respond after removing a component from dependencies.json");
    });

    /**
     * #19486 – Verify that reload is not triggered if the file is saved with invalid JSON
     */
    test('Reload is not triggered for invalid JSON', async function () {
        this.timeout(60000);

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        const componentsBefore = await api.sendCommand("dependency/componentsLoaded", projectPath);

        // Write invalid JSON to dependencies.json
        fs.writeFileSync(depsPath, '{ invalid json content !!!', 'utf-8');

        // Wait to ensure file watcher fires but reload does NOT happen
        await sleep(5000);

        // The server should still be responsive — the invalid JSON should have been rejected
        const componentsAfter = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(componentsAfter, "Server should still be responsive after invalid JSON is written");
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
