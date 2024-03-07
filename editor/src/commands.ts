import * as ext from "./lsp_ext";
import { Ctx } from "./ctx";
import * as vscode from "vscode";
import { WorkspaceFullDocumentDiagnosticReport } from "vscode-languageclient";

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
                if(response)
                {
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

export function checkWorkspaceSyntax(ctx: Ctx): Cmd {
    if(ctx.config.diagnosticEnabled && ctx.config.diagnosticScope === "Workspace")
    {
        return async()=>{
            const userResponse = await vscode.window.showErrorMessage(
                `Workspace syntax checking is already running`
            );
        }
    }

    return async()=> {vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Workspace syntax check running",
        cancellable: false
    }, async (progress, token) => {
        const client = ctx.client;
        const params = client.code2ProtocolConverter.asTextDocumentIdentifier(
            vscode.window.activeTextEditor.document
        );
        const response = await client.sendRequest(ext.checkWorkspaceSyntax, params);
        
        let diagnosticCollection = ctx.workspaceDiagnostic;
        diagnosticCollection.clear()
        for(const diagWorkspace of response.items)
        {
            const diagnostics : vscode.Diagnostic[] = [];
            let currentItem = diagWorkspace as WorkspaceFullDocumentDiagnosticReport;
            let currentDiagnostics = vscode.languages.getDiagnostics(vscode.Uri.parse(currentItem.uri))
            for(const diag of currentItem.items)
            {
                const range : vscode.Range = new vscode.Range(diag.range.start.line, diag.range.start.character, diag.range.end.line, diag.range.end.character);
                const diagnostic = new vscode.Diagnostic(range, diag.message, diag.severity - 1);
                if(!currentDiagnostics.find((cdiagnostic =>{
                    return cdiagnostic.range.isEqual(diagnostic.range) && cdiagnostic.message === diagnostic.message
                })))
                {
                    diagnostics.push(diagnostic);
                }

            }
            
            diagnosticCollection.set(vscode.Uri.parse(currentItem.uri), diagnostics);
        }
    });}
}

