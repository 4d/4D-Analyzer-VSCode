import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path'
import * as os from 'os'

export class Config {

    readonly rootSection = "4D-Analyzer";


    private readonly requiresReloadOpts = [
        "server.path"
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

    private get _serverPath() {
        return this.get<null | string>("server.path") ?? this.get<null | string>("serverPath");
    }

    get serverPath() {
        let serverPath = this._serverPath;
        const type = os.type();
        const dirname = path.basename(serverPath);
        if(type === "Darwin" && dirname.endsWith(".app")) {
            const name = path.parse(serverPath).name;
            serverPath= path.join(serverPath, "Contents", "MacOS", name)
        }
        return serverPath;
    }

    private _checkServerPath() : boolean{
        return fs.existsSync(this.serverPath);
    }
    
    public async checkSettings() {
        if(!this._checkServerPath())
        {
            const userResponse = await vscode.window.showErrorMessage(
                `The 4D path is not valid`,
                "Show Settings",
                "Continue"
            );
    
            if(userResponse === "Show Settings")
            {
                vscode.commands.executeCommand( 'workbench.action.openSettings', '4D-Analyzer.server.path' );
            }
        }
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