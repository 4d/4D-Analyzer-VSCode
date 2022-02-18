import * as vscode from 'vscode';


export class Config {

    readonly rootSection = "4D-Analyzer";


    private readonly requiresReloadOpts = [
        "serverPath",
        "serverPort"
    ]
        .map(opt => `${this.rootSection}.${opt}`);

    constructor(ctx: vscode.ExtensionContext) {
        vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this, ctx.subscriptions);
    }

    private get cfg(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(this.rootSection);
    }

    private get<T>(path: string): T {
        return this.cfg.get<T>(path)!;
    }

    get serverPath() {
        return this.get<null | string>("server.path") ?? this.get<null | string>("serverPath");
    }

    get serverPort() {
        return this.get<null | number>("server.port") ?? this.get<null | number>("serverPort");
    }

    private async onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent) {

        const requiresReloadOpt = this.requiresReloadOpts.find(
            opt => event.affectsConfiguration(opt)
        );

        if (!requiresReloadOpt) return;

        const userResponse = await vscode.window.showInformationMessage(
            `Changing "${requiresReloadOpt}" requires a reload`,
            "Reload now"
        );

        if (userResponse === "Reload now") {
            await vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
    }
}