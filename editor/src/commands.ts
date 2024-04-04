import * as ext from "./lsp_ext";
import { Ctx } from "./ctx";
import * as vscode from "vscode";
import { WorkspaceFullDocumentDiagnosticReport } from "vscode-languageclient";
import { LabeledVersion } from "./labeledVersion";
import { Logger } from "./logger";

export type Cmd = (...args: any[]) => unknown;

export function filesStatus(ctx: Ctx): Cmd {

    const tdcp = new (class implements vscode.TextDocumentContentProvider {
        readonly uri = vscode.Uri.parse("4d-analyzer-filesStatus://filesStatus");
        readonly eventEmitter = new vscode.EventEmitter<vscode.Uri>();

        async provideTextDocumentContent(_uri: vscode.Uri): Promise<string> {
            if (!vscode.window.activeTextEditor) return null;
            const client = ctx.client;
            const response = await client.sendRequest(ext.filesStatus);
            return new Promise<string>(resolve => {
                if (response) {
                    resolve(JSON.stringify(response));
                }
                else
                    resolve("");
            });
        }

        get onDidChange(): vscode.Event<vscode.Uri> {
            return this.eventEmitter.event;
        }
    })();

    ctx.pushExtCleanup(
        vscode.workspace.registerTextDocumentContentProvider("4d-analyzer-filesStatus", tdcp)
    );

    return async () => {
        const document = await vscode.workspace.openTextDocument(tdcp.uri);
        tdcp.eventEmitter.fire(tdcp.uri);
        void (await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.Two,
            preserveFocus: true,
        }));
    };
}


export function updateTool4D(ctx: Ctx): Cmd {

    return async () => {
        try {
            await ctx.downloadLastTool4D();
            const userResponse = await vscode.window.showInformationMessage(
                `The tool4D has been updated a restart is needed`,
                "Reload now"
            );

            if (userResponse === "Reload now") {
                await vscode.commands.executeCommand("workbench.action.reloadWindow");
            }
        } catch (error) {
            const userResponse = await vscode.window.showErrorMessage(
                error,
            );
        }
    };
}

export function display4DVersion(ctx: Ctx): Cmd {

    return async () => {
        try {
            const version = ctx.get4DVersion();
            const userResponse = await vscode.window.showInformationMessage(
                `4D Version ${(await version).toString(true)}`,
            );


        } catch (error) {
            const userResponse = await vscode.window.showErrorMessage(
                error,
            );
        }
    };
}


export function cleanUnusedToolVersions(ctx: Ctx): Cmd {

    return async () => {

        return await ctx.cleanUnusedToolVersions();
    };
}

export function checkWorkspaceSyntax(ctx: Ctx): Cmd {
    if (ctx.config.diagnosticEnabled && ctx.config.diagnosticScope === "Workspace") {
        return async () => {
            const userResponse = await vscode.window.showErrorMessage(
                `Workspace syntax checking is already running`
            );
        };
    }



    return async () => {
        if (ctx.config.get4DVersion().compare(new LabeledVersion(20, 5, 0, 0, true, "stable", false)) < 0) {
            vscode.window.showErrorMessage(`The workspace syntax checking is available with at least a 20R5`);
            return;
        }
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Workspace syntax check running",
            cancellable: false
        }, async (progress, token) => {

            const client = ctx.client;
            const params = client.code2ProtocolConverter.asTextDocumentIdentifier(
                vscode.window.activeTextEditor.document
            );

            const response = await client.sendRequest(ext.checkWorkspaceSyntax, params);
            const diagnosticCollection = ctx.workspaceDiagnostic;
            diagnosticCollection.clear();
            response.items.forEach(diagWorkspace => {
                const diagnostics: vscode.Diagnostic[] = [];
                const currentItem = diagWorkspace as WorkspaceFullDocumentDiagnosticReport;
                const currentDiagnostics = vscode.languages.getDiagnostics(vscode.Uri.parse(currentItem.uri));
                for (const diag of currentItem.items) {
                    const range: vscode.Range = new vscode.Range(diag.range.start.line, diag.range.start.character, diag.range.end.line, diag.range.end.character);
                    const diagnostic = new vscode.Diagnostic(range, diag.message, diag.severity - 1);
                    if (!currentDiagnostics.find((cdiagnostic => {
                        return cdiagnostic.range.isEqual(diagnostic.range) && cdiagnostic.message === diagnostic.message;
                    }))) {
                        diagnostics.push(diagnostic);
                    }
                }
                diagnosticCollection.set(vscode.Uri.parse(currentItem.uri), diagnostics);
            });
        });
    };
}

