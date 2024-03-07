import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import * as lc from "vscode-languageclient/node";
import {Ctx } from "./ctx";
export class Config {

    readonly rootSection = "4D-Analyzer";

    private _ctx : Ctx;
    private readonly requiresReloadOpts = [
        "server.path",
        "diagnostics.enable",
        "diagnostics.scope"
        ]
        .map(opt => `${this.rootSection}.${opt}`);

    constructor(ctx: vscode.ExtensionContext) {
        vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this, ctx.subscriptions);
    }

    setContext(ctx : Ctx) {
        this._ctx = ctx;
    }

    get cfg(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(this.rootSection);
    }

    public get diagnosticScope() : string{
        return this.get<string>("diagnostics.scope");
    }

    public get diagnosticEnabled() : string{
        return this.get<string>("diagnostics.enable");
    }

    private get<T>(path: string): T {
        return this.cfg.get<T>(path)!;
    }

    private get _serverPath() {
        return this.get<string>("server.path") ?? this.get<string>("serverPath");
    }

    get serverPath() {
        let serverPath = this._serverPath;
        const type = os.type();
        const dirname = path.basename(serverPath);
        if(type === "Darwin" && dirname.endsWith(".app")) {
            let nameExecutable = "";
            const infoPlistPath = path.join(serverPath, "Contents", "Info.plist");
            if(fs.existsSync(infoPlistPath)) {
                const content : string = fs.readFileSync(infoPlistPath).toString();
                const match = content.match(/CFBundleExecutable<\/key>\s*<string>(.*)<\/string>/mi);
                if(match !== null && match.length > 1) {
                    nameExecutable = match[1];
                }
            }
            
            if(nameExecutable === "") {
                nameExecutable = path.parse(serverPath).name;
            }
            serverPath= path.join(serverPath, "Contents", "MacOS", nameExecutable);
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
            
        await this._ctx?.client.sendNotification(lc.DidChangeConfigurationNotification.type, {
            settings: this.cfg,
        });

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