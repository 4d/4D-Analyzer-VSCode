import * as ext from "./lsp_ext";
import { Ctx } from "./ctx";
import * as vscode from "vscode";
import { WorkspaceDocumentDiagnosticReport, FullDocumentDiagnosticReport,
    WorkspaceFullDocumentDiagnosticReport } from "vscode-languageclient";

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
let id = 0;
export function checkSyntax(ctx: Ctx): Cmd {
    return async()=> {
        id++;
        const client = ctx.client;
        const params = client.code2ProtocolConverter.asTextDocumentIdentifier(
            vscode.window.activeTextEditor.document
        );
        const response = await client.sendRequest(ext.checkSyntax, params);
        let currentItem : WorkspaceFullDocumentDiagnosticReport;
        const diagnosticName : string = client.diagnostics.name;
        console.log("NAME" + diagnosticName);
        //.
        const diagnosticCollection = client.diagnostics;
        diagnosticCollection.clear();
        const diagnostics : vscode.Diagnostic[] = [];
        for(const diagWorkspace of response.items)
        {
            currentItem = diagWorkspace as WorkspaceFullDocumentDiagnosticReport;
            for(const diag of currentItem.items)
            {
                const range : vscode.Range = new vscode.Range(diag.range.start.line, diag.range.start.character, diag.range.end.line, diag.range.end.character);
                const diagnostic = new vscode.Diagnostic(range, diag.message, diag.severity - 1);
                diagnostics.push(diagnostic);
            }
            diagnosticCollection.set(vscode.Uri.parse(currentItem.uri), diagnostics);
        }
        
        ctx.extensionContext.subscriptions.push(diagnosticCollection);

    };
}

