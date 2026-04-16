import * as vscode from 'vscode';

/**
 * Visually hides 4D command tokens (e.g. `:C11`, `:C1525`) in the editor without
 * modifying the document on disk. The text remains in the buffer so LSP offsets,
 * diagnostics, hovers and selection are unaffected.
 *
 * Detection uses the LSP semantic tokens so we only hide token suffixes that
 * belong to an actual command/function/method/constant — never inside strings
 * or comments.
 */

const TOKEN_REGEX = /:C\d+/g;

// Semantic token types we consider "command-like" candidates for a :Cxxx suffix.
// The 4D LSP declares `command` as a type (superType: function). We also accept
// the standard adjacent types in case the server classifies differently.
const COMMAND_TYPE_NAMES = new Set([
    'command',
    'function',
    'method',
    'constant',
]);

// The lookahead window (in characters) after a command token in which we
// accept a trailing `:Cxxx`. 32 is plenty; tokens like `:C99999` fit easily.
const LOOKAHEAD = 32;

export class TokenHider {
    private readonly _decoration: vscode.TextEditorDecorationType;
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _debounceTimers = new Map<string, NodeJS.Timeout>();
    private _enabled: boolean;

    constructor() {
        this._decoration = vscode.window.createTextEditorDecorationType({
            // `display: none` truly hides the range (no gap). Text stays in the
            // buffer — copy/paste still yields the original characters and the
            // LSP sees the unmodified document.
            textDecoration: 'none; display: none;',
        });

        this._enabled = this._readConfig();

        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('4D-Analyzer.hideCommandTokens')) {
                    this._enabled = this._readConfig();
                    this._refreshAll();
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) this._scheduleUpdate(editor);
            }),
            vscode.window.onDidChangeVisibleTextEditors(editors => {
                for (const editor of editors) this._scheduleUpdate(editor);
            }),
            vscode.workspace.onDidChangeTextDocument(event => {
                for (const editor of vscode.window.visibleTextEditors) {
                    if (editor.document === event.document) {
                        this._scheduleUpdate(editor);
                    }
                }
            }),
            vscode.workspace.onDidCloseTextDocument(doc => {
                this._debounceTimers.delete(doc.uri.toString());
            }),
        );

        // Prime currently visible editors.
        for (const editor of vscode.window.visibleTextEditors) {
            this._scheduleUpdate(editor);
        }
    }

    public dispose() {
        for (const t of this._debounceTimers.values()) clearTimeout(t);
        this._debounceTimers.clear();
        for (const d of this._disposables) d.dispose();
        this._disposables.length = 0;
        this._decoration.dispose();
    }

    private _readConfig(): boolean {
        return vscode.workspace
            .getConfiguration('4D-Analyzer')
            .get<boolean>('hideCommandTokens', true);
    }

    private _refreshAll() {
        for (const editor of vscode.window.visibleTextEditors) {
            this._scheduleUpdate(editor);
        }
    }

    private _scheduleUpdate(editor: vscode.TextEditor) {
        const languageId = editor.document.languageId;
        if (languageId !== '4d' && languageId !== '4qs') return;

        const key = editor.document.uri.toString();
        const existing = this._debounceTimers.get(key);
        if (existing) clearTimeout(existing);

        this._debounceTimers.set(
            key,
            setTimeout(() => {
                this._debounceTimers.delete(key);
                this._update(editor).catch(() => { /* ignore */ });
            }, 100),
        );
    }

    private async _update(editor: vscode.TextEditor) {
        // Editor may have been disposed during the debounce window.
        if (!vscode.window.visibleTextEditors.includes(editor)) return;

        if (!this._enabled) {
            editor.setDecorations(this._decoration, []);
            return;
        }

        const uri = editor.document.uri;

        const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
            'vscode.provideDocumentSemanticTokensLegend',
            uri,
        );
        const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
            'vscode.provideDocumentSemanticTokens',
            uri,
        );

        if (!legend || !tokens || !tokens.data || tokens.data.length === 0) {
            editor.setDecorations(this._decoration, []);
            return;
        }

        const commandTypeIds = new Set<number>();
        legend.tokenTypes.forEach((name, idx) => {
            if (COMMAND_TYPE_NAMES.has(name)) commandTypeIds.add(idx);
        });

        if (commandTypeIds.size === 0) {
            editor.setDecorations(this._decoration, []);
            return;
        }

        const ranges = this._collectRanges(editor.document, tokens.data, commandTypeIds);
        editor.setDecorations(this._decoration, ranges);
    }

    private _collectRanges(
        doc: vscode.TextDocument,
        data: Uint32Array | ReadonlyArray<number>,
        commandTypeIds: Set<number>,
    ): vscode.Range[] {
        const ranges: vscode.Range[] = [];
        const lineCount = doc.lineCount;

        let line = 0;
        let char = 0;

        for (let i = 0; i + 4 < data.length; i += 5) {
            const deltaLine = data[i];
            const deltaStart = data[i + 1];
            const length = data[i + 2];
            const tokenType = data[i + 3];

            if (deltaLine === 0) {
                char += deltaStart;
            } else {
                line += deltaLine;
                char = deltaStart;
            }

            if (!commandTypeIds.has(tokenType)) continue;
            if (line >= lineCount) continue;

            const lineText = doc.lineAt(line).text;

            // Scan the token itself plus a short lookahead on the same line.
            // This catches both `Num:C11` (if the token range covers the suffix)
            // and `Num` + `:C11` (if the suffix is outside the token).
            const scanStart = char;
            const scanEnd = Math.min(lineText.length, char + length + LOOKAHEAD);
            if (scanEnd <= scanStart) continue;

            const slice = lineText.substring(scanStart, scanEnd);

            TOKEN_REGEX.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = TOKEN_REGEX.exec(slice)) !== null) {
                const startCol = scanStart + m.index;
                const endCol = startCol + m[0].length;
                ranges.push(
                    new vscode.Range(
                        new vscode.Position(line, startCol),
                        new vscode.Position(line, endCol),
                    ),
                );
            }
        }

        return ranges;
    }
}
