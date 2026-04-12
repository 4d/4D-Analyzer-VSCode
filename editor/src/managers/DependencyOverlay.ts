import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import { parseTree, parse, getNodeValue } from 'jsonc-parser';

interface EnvOverlayHint {
    dependencyName: string;
    keyStartOffset: number;
    keyEndOffset: number;
    envValue: unknown;
    effectiveValue: unknown;
    mergeMode: 'merge' | 'replace';
}

interface LockOverlayHint {
    dependencyName: string;
    keyStartOffset: number;
    keyEndOffset: number;
    lockEntry: Record<string, unknown>;
}

const OPEN_FILE_COMMAND = '4d-analyzer.openOverlayFile';

export class DependencyOverlay {
    private _envDecorationType: vscode.TextEditorDecorationType;
    private _lockDecorationType: vscode.TextEditorDecorationType;

    constructor(private _extensionContext: vscode.ExtensionContext) {
        this._envDecorationType = vscode.window.createTextEditorDecorationType({
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });

        this._lockDecorationType = vscode.window.createTextEditorDecorationType({
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });

        this._extensionContext.subscriptions.push(this._envDecorationType, this._lockDecorationType);
        this.registerCommand();
        this.register();
    }

    private registerCommand(): void {
        const command = vscode.commands.registerCommand(
            OPEN_FILE_COMMAND,
            (filePath: string) => {
                void vscode.window.showTextDocument(vscode.Uri.file(filePath));
            }
        );
        this._extensionContext.subscriptions.push(command);
    }

    private register(): void {
        const refreshVisibleEditors = () => {
            void this.refreshVisibleEditors();
        };

        const refreshRelevantDocument = (document: vscode.TextDocument) => {
            const baseName = path.basename(document.uri.fsPath);
            if (baseName === 'dependencies.json' || baseName === 'environment4d.json' || baseName === 'dependencies-lock.json') {
                refreshVisibleEditors();
            }
        };

        const dependencyWatcher = vscode.workspace.createFileSystemWatcher('**/dependencies.json');
        const envWatcher = vscode.workspace.createFileSystemWatcher('**/environment4d.json');
        const lockWatcher = vscode.workspace.createFileSystemWatcher('**/dependencies-lock.json');

        this._extensionContext.subscriptions.push(
            dependencyWatcher,
            envWatcher,
            lockWatcher,
            vscode.window.onDidChangeVisibleTextEditors(refreshVisibleEditors),
            vscode.window.onDidChangeActiveTextEditor(refreshVisibleEditors),
            vscode.workspace.onDidOpenTextDocument(refreshRelevantDocument),
            vscode.workspace.onDidCloseTextDocument(refreshRelevantDocument),
            vscode.workspace.onDidSaveTextDocument(refreshRelevantDocument),
            vscode.workspace.onDidChangeTextDocument((event) => refreshRelevantDocument(event.document)),
            dependencyWatcher.onDidChange(refreshVisibleEditors),
            dependencyWatcher.onDidCreate(refreshVisibleEditors),
            dependencyWatcher.onDidDelete(refreshVisibleEditors),
            envWatcher.onDidChange(refreshVisibleEditors),
            envWatcher.onDidCreate(refreshVisibleEditors),
            envWatcher.onDidDelete(refreshVisibleEditors),
            lockWatcher.onDidChange(refreshVisibleEditors),
            lockWatcher.onDidCreate(refreshVisibleEditors),
            lockWatcher.onDidDelete(refreshVisibleEditors)
        );

        refreshVisibleEditors();
    }

    private async refreshVisibleEditors(): Promise<void> {
        await Promise.all(
            vscode.window.visibleTextEditors.map((editor) => this.refreshEditor(editor))
        );
    }

    private async refreshEditor(editor: vscode.TextEditor): Promise<void> {
        if (!this.isDependenciesDocumentPath(editor.document.uri.fsPath)) {
            editor.setDecorations(this._envDecorationType, []);
            editor.setDecorations(this._lockDecorationType, []);
            return;
        }

        const searchStartDir = this.getSearchStartDir(editor.document.uri.fsPath);
        if (!searchStartDir) {
            editor.setDecorations(this._envDecorationType, []);
            editor.setDecorations(this._lockDecorationType, []);
            return;
        }

        try {
            await Promise.all([
                this.refreshLockDecorations(editor, searchStartDir),
                this.refreshEnvDecorations(editor, searchStartDir)
            ]);
        } catch {
            editor.setDecorations(this._envDecorationType, []);
            editor.setDecorations(this._lockDecorationType, []);
        }
    }

    // ── Environment overlay ──────────────────────────────────────────────

    private async refreshEnvDecorations(editor: vscode.TextEditor, searchStartDir: string): Promise<void> {
        const envFilePath = await this.findNearestEnvironmentFile(searchStartDir);
        if (!envFilePath) {
            editor.setDecorations(this._envDecorationType, []);
            return;
        }

        const envText = await this.readDocumentOrFile(envFilePath);
        const hints = this.buildEnvHints(editor.document.getText(), envText);
        const decorations: vscode.DecorationOptions[] = hints.map((hint) => {
            const keyStart = editor.document.positionAt(hint.keyStartOffset);
            const lineEnd = editor.document.lineAt(keyStart.line).range.end;
            const hoverMessage = new vscode.MarkdownString(this.buildEnvHoverText(envFilePath, hint));
            hoverMessage.isTrusted = { enabledCommands: [OPEN_FILE_COMMAND] };

            return {
                range: new vscode.Range(keyStart, lineEnd),
                hoverMessage
            };
        });

        editor.setDecorations(this._envDecorationType, decorations);
    }

    buildEnvHints(dependenciesText: string, envText: string): EnvOverlayHint[] {
        const dependenciesRoot = parseTree(dependenciesText);
        const environmentObject = parse(envText);

        if (!dependenciesRoot || dependenciesRoot.type !== 'object' || !this.isPlainObject(environmentObject)) {
            return [];
        }

        const dependenciesNode = this.findDependenciesNode(dependenciesRoot);
        if (!dependenciesNode) {
            return [];
        }

        const environmentDependencies = environmentObject.dependencies;
        if (!this.isPlainObject(environmentDependencies)) {
            return [];
        }

        const hints: EnvOverlayHint[] = [];

        for (const property of dependenciesNode.children || []) {
            const keyNode = property.children?.[0];
            const valueNode = property.children?.[1];
            if (!keyNode || !valueNode) {
                continue;
            }

            const depName = keyNode.value as string;
            const envValue = environmentDependencies[depName];
            if (envValue === undefined) {
                continue;
            }

            const baseValue = getNodeValue(valueNode);
            const mergeMode = this.isPlainObject(baseValue) && this.isPlainObject(envValue) ? 'merge' : 'replace';
            const mergedValue = mergeMode === 'merge'
                ? { ...(baseValue as Record<string, unknown>), ...(envValue as Record<string, unknown>) }
                : envValue;

            hints.push({
                dependencyName: depName,
                keyStartOffset: keyNode.offset,
                keyEndOffset: keyNode.offset + keyNode.length,
                envValue,
                effectiveValue: mergedValue,
                mergeMode
            });
        }

        return hints;
    }

    private buildEnvHoverText(envFilePath: string, hint: EnvOverlayHint): string {
        const mergeDescription = hint.mergeMode === 'merge'
            ? 'Environment values are **merged** into the dependency definition.'
            : 'Environment value **replaces** the dependency definition.';

        const commandArgs = encodeURIComponent(JSON.stringify([envFilePath]));
        const openLink = `[Open environment file](command:${OPEN_FILE_COMMAND}?${commandArgs})`;

        return [
            `\u{1F331} **${hint.dependencyName}** — environment override`,
            '',
            mergeDescription,
            '',
            openLink,
            '',
            'Environment value:',
            '```json',
            this.stringifyJson(hint.envValue),
            '```',
            '',
            'Effective value:',
            '```json',
            this.stringifyJson(hint.effectiveValue),
            '```'
        ].join('\n');
    }

    // ── Lock file overlay ────────────────────────────────────────────────

    private async refreshLockDecorations(editor: vscode.TextEditor, searchStartDir: string): Promise<void> {
        const lockFilePath = await this.findLockFile(searchStartDir);
        if (!lockFilePath) {
            editor.setDecorations(this._lockDecorationType, []);
            return;
        }

        const lockText = await this.readDocumentOrFile(lockFilePath);
        const hints = this.buildLockHints(editor.document.getText(), lockText);
        const decorations: vscode.DecorationOptions[] = hints.map((hint) => {
            const keyStart = editor.document.positionAt(hint.keyStartOffset);
            const lineEnd = editor.document.lineAt(keyStart.line).range.end;
            const hoverMessage = new vscode.MarkdownString(this.buildLockHoverText(lockFilePath, hint));
            hoverMessage.isTrusted = { enabledCommands: [OPEN_FILE_COMMAND] };

            return {
                range: new vscode.Range(keyStart, lineEnd),
                hoverMessage
            };
        });

        editor.setDecorations(this._lockDecorationType, decorations);
    }

    private buildLockHints(dependenciesText: string, lockText: string): LockOverlayHint[] {
        const dependenciesRoot = parseTree(dependenciesText);
        const lockObject = parse(lockText);

        if (!dependenciesRoot || dependenciesRoot.type !== 'object' || !this.isPlainObject(lockObject)) {
            return [];
        }

        const dependenciesNode = this.findDependenciesNode(dependenciesRoot);
        if (!dependenciesNode) {
            return [];
        }

        const lockDependencies = lockObject.dependencies;
        if (!this.isPlainObject(lockDependencies)) {
            return [];
        }

        const hints: LockOverlayHint[] = [];

        for (const property of dependenciesNode.children || []) {
            const keyNode = property.children?.[0];
            if (!keyNode) {
                continue;
            }

            const depName = keyNode.value as string;
            const lockEntry = lockDependencies[depName];
            if (!this.isPlainObject(lockEntry)) {
                continue;
            }

            hints.push({
                dependencyName: depName,
                keyStartOffset: keyNode.offset,
                keyEndOffset: keyNode.offset + keyNode.length,
                lockEntry
            });
        }

        return hints;
    }

    private buildLockHoverText(lockFilePath: string, hint: LockOverlayHint): string {
        const entry = hint.lockEntry;
        const loaded = entry.loaded === true;
        const found = entry.found === true;

        const statusIcon = loaded ? '\u2705' : (found ? '\u26A0\uFE0F' : '\u274C');
        const statusLabel = loaded ? 'Loaded' : (found ? 'Found (not loaded)' : 'Not found');

        const lines: string[] = [
            `\u{1F512} **${hint.dependencyName}** — ${statusIcon} ${statusLabel}`,
            ''
        ];

        if (entry.tag) {
            lines.push(`**Tag:** ${entry.tag as string}`);
        }
        if (entry.version) {
            lines.push(`**Version:** ${entry.version as string}`);
        }
        if (entry.path) {
            lines.push(`**Path:** \`${this.convertHfsPath(entry.path as string)}\``);
        }
        if (entry.github) {
            lines.push(`**GitHub:** ${entry.github as string}`);
        }
        if (entry.htmlURL) {
            lines.push(`**Release:** [${entry.htmlURL as string}](${entry.htmlURL as string})`);
        }
        if (entry.isPrimary !== undefined) {
            lines.push(`**Primary:** ${entry.isPrimary ? 'Yes' : 'No'}`);
        }

        this.appendMessages(lines, entry.errors, '\u274C Error');
        this.appendMessages(lines, entry.warnings, '\u26A0\uFE0F Warning');

        lines.push('');
        const commandArgs = encodeURIComponent(JSON.stringify([lockFilePath]));
        lines.push(`[Open lock file](command:${OPEN_FILE_COMMAND}?${commandArgs})`);

        return lines.join('\n');
    }

    private appendMessages(lines: string[], messages: unknown, label: string): void {
        if (!Array.isArray(messages) || messages.length === 0) {
            return;
        }
        lines.push('');
        for (const msg of messages) {
            if (typeof msg === 'string') {
                lines.push(`${label}: ${msg}`);
            } else if (this.isPlainObject(msg) && typeof (msg as Record<string, unknown>).message === 'string') {
                lines.push(`${label}: ${(msg as Record<string, string>).message}`);
            }
        }
    }

    // ── Shared helpers ───────────────────────────────────────────────────

    private findDependenciesNode(root: ReturnType<typeof parseTree>) {
        const dependenciesProperty = root?.children?.find((property) => property.children?.[0]?.value === 'dependencies');
        const node = dependenciesProperty?.children?.[1];
        return node?.type === 'object' ? node : undefined;
    }

    private stringifyJson(value: unknown): string {
        return JSON.stringify(value, null, 2) ?? 'null';
    }

    private isPlainObject(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private convertHfsPath(hfsPath: string): string {
        const hfsVolumePattern = /^[^:]+:/;
        if (!hfsVolumePattern.test(hfsPath)) {
            return hfsPath;
        }
        return '/' + hfsPath.replace(hfsVolumePattern, '').replace(/:/g, '/').replace(/\/$/, '');
    }

    private isDependenciesDocumentPath(filePath: string): boolean {
        return path.basename(filePath) === 'dependencies.json';
    }

    private getSearchStartDir(filePath: string): string | undefined {
        if (!this.isDependenciesDocumentPath(filePath)) {
            return undefined;
        }
        return path.dirname(filePath);
    }

    private async findNearestEnvironmentFile(startDir: string): Promise<string | undefined> {
        let currentDir = startDir;
        const root = path.parse(currentDir).root;

        while (true) {
            const envFile = path.join(currentDir, 'environment4d.json');
            try {
                await fsPromises.access(envFile);
                return envFile;
            } catch {
            }

            if (currentDir === root) {
                return undefined;
            }

            currentDir = path.dirname(currentDir);
        }
    }

    findNearestEnvironmentFileSync(startDir: string): string | undefined {
        let currentDir = startDir;
        const root = path.parse(currentDir).root;

        while (true) {
            const envFile = path.join(currentDir, 'environment4d.json');
            if (fs.existsSync(envFile)) {
                return envFile;
            }

            if (currentDir === root) {
                return undefined;
            }

            currentDir = path.dirname(currentDir);
        }
    }

    private async findLockFile(sourcesDir: string): Promise<string | undefined> {
        // dependencies.json is in Project/Sources/
        // lock file is in <projectRoot>/userPreferences.<userName>/dependencies-lock.json
        const projectRoot = path.dirname(path.dirname(sourcesDir));
        const userName = os.userInfo().username;
        const lockFile = path.join(projectRoot, `userPreferences.${userName}`, 'dependencies-lock.json');

        try {
            await fsPromises.access(lockFile);
            return lockFile;
        } catch {
            return undefined;
        }
    }

    private async readDocumentOrFile(filePath: string): Promise<string> {
        const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === filePath);
        if (openDocument) {
            return openDocument.getText();
        }

        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
        return Buffer.from(content).toString('utf-8');
    }
}