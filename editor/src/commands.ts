import * as ext from "./lsp_ext";
import { Ctx } from "./ctx";
import * as vscode from "vscode";
import {
    WorkspaceFullDocumentDiagnosticReport
} from "vscode-languageclient";

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

