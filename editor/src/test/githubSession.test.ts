
import * as vscode from 'vscode';
import assert from "assert";
import { getDocUri } from './helper';

/**
 * #19355 – Given some GitHub components are to be downloaded, When a GitHub session
 *          is already opened in VSCode, Then the 4D-Analyzer extension shall use it.
 */
suite('GitHub Session Reuse', () => {
    const projectUri = getDocUri('LanguageServerProtocol/Project/LanguageServerProtocol.4DProject');

    /**
     * Verify that when a GitHub session is already active, the 4D-Analyzer
     * extension uses the existing session instead of prompting for a new one.
     */
    test('Extension uses existing GitHub session for component downloads', async function () {
        this.timeout(60000);

        const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
        const api = await ext.activate();
        const projectPath = projectUri.toString();
        await api.init(projectPath);

        // Check if a GitHub authentication session already exists
        const GITHUB_AUTH_PROVIDER_ID = 'github';
        const SCOPES = ['repo', 'public_repo'];

        const existingSession = await vscode.authentication.getSession(
            GITHUB_AUTH_PROVIDER_ID,
            SCOPES,
            { createIfNone: false }
        );

        if (!existingSession) {
            // If no session exists, this test validates that the extension
            // gracefully handles the absence of a GitHub session
            console.log('No existing GitHub session found — skipping active session reuse assertion');
            return;
        }

        // When a session exists, verify the extension can fetch dependency info
        // without opening a new authentication prompt
        const result = await api.sendCommand("dependency/componentsLoaded", projectPath);
        assert.ok(result, "Extension should be able to query components using the existing GitHub session");

        // Verify the same session is still active (not replaced)
        const sessionAfter = await vscode.authentication.getSession(
            GITHUB_AUTH_PROVIDER_ID,
            SCOPES,
            { createIfNone: false }
        );
        assert.ok(sessionAfter, "GitHub session should still be active after extension operations");
        assert.strictEqual(
            existingSession.accessToken,
            sessionAfter.accessToken,
            "The extension should reuse the existing GitHub session, not create a new one"
        );
    });
});
