import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import * as lc from "vscode-languageclient/node";
import { Ctx } from "./ctx";
import { LabeledVersion } from './labeledVersion';
import { InfoPlistManager } from './infoplist';

export class Config {

    readonly rootSection = "4D-Analyzer";

    _tool4DPath: string;
    _ctx: Ctx;
    private readonly requiresReloadOpts = [
        "server.path",
        "server.tool4d.version",
        "server.tool4d.location",
        "server.tool4d.enable",
        "server.tool4d.channel",
        "diagnostics.enable",
        "diagnostics.scope",
    ]

        .map(opt => `${this.rootSection}.${opt}`);

    constructor(ctx: vscode.ExtensionContext) {
        vscode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor, this, ctx.subscriptions);
        vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this, ctx.subscriptions);
    }

    init(ctx: Ctx) {
        this._ctx = ctx;
    }

    get cfg(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(this.rootSection);
    }

    public setTool4DPath(inPath: string) {
        this._tool4DPath = inPath;
    }

    public get diagnosticScope() : string{
        return this.get<string>("diagnostics.scope");
    }

    public get diagnosticEnabled() : boolean{
        return this.get<boolean>("diagnostics.enable");
    }

    private get<T>(path: string): T {
        return this.cfg.get<T>(path)!;
    }

    public tool4DWanted(): string {
        return this._tool4dVersionFromSettings;
    }

    public IsTool4DEnabled(): boolean {
        if(process.env["TOOL4D_DOWNLOAD"]!=undefined)
        {
            return process.env["TOOL4D_DOWNLOAD"] == 'true';
        }
        return this._tool4dEnableFromSettings;
    }

    public tool4DLocation(): string {
        return this._tool4dLocationFromSettings;
    }

    public tool4DDownloadChannel(): string {
        return this._tool4dDownloadChannel;
    }

    public tool4dAPIKEY(): string {
        return this._tool4dAPIKEY;
    }

    private get _serverPathFromSettings(): string {
        return this.get<string>("server.path") ?? this.get<string>("serverPath");
    }

    private get _tool4dVersionFromSettings(): string {
        return this.get<string>("server.tool4d.version");
    }

    private get _tool4dDownloadChannel(): string {
        return this.get<string>("server.tool4d.channel");
    }

    private get _tool4dEnableFromSettings(): boolean {
        return this.get<boolean>("server.tool4d.enable") ?? this.get<boolean>("server.tool4dEnable");
    }

    private get _tool4dLocationFromSettings(): string {
        return this.get<string>("server.tool4d.location");
    }

    private get _tool4dAPIKEY(): string {
        return this.get<string>("server.tool4d.FOURD_RESOURCE_API_KEY") ?? process.env["FOURD_RESOURCE_API_KEY"];
    }

    private get _serverPath() {
        const p = this._serverPathFromSettings;
        if (this.IsTool4DEnabled()) {
            return this._tool4DPath;
        }
        return p;
    }

    get serverPath() {
        let serverPath = this._serverPath;
        
        const type = os.type();
        const dirname = path.basename(serverPath);
        if (type === "Darwin" && dirname.endsWith(".app")) {
            const infoPlist = InfoPlistManager.fromExePath(serverPath);
           
            let nameExecutable =  infoPlist.getExeName();
            if (nameExecutable === "") {
                nameExecutable = path.parse(serverPath).name;
            }
            serverPath = path.join(serverPath, "Contents", "MacOS", nameExecutable);
        }
        return serverPath;
    }

    public get4DVersion(): LabeledVersion {
        const infoPlist = InfoPlistManager.fromExePath(this._serverPath);
        return infoPlist.getVersion();
    }

    private _checkServerPath(): boolean {
        return fs.existsSync(this.serverPath);
    }

    public async checkSettings() {
        if (!this._checkServerPath()) {
            const userResponse = await vscode.window.showErrorMessage(
                `The 4D path is not valid`,
                "Show Settings",
                "Continue"
            );

            if (userResponse === "Show Settings") {
                vscode.commands.executeCommand('workbench.action.openSettings', '4D-Analyzer.server.path');
            }
        }
    }

    private async onDidChangeActiveTextEditor(event: vscode.TextEditor) {
        if(event)
        {
            await this._ctx?.client.sendNotification("experimental/didChangeActiveTextEditor", 
            this._ctx?.client.code2ProtocolConverter.asTextDocumentIdentifier(
                event.document));
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