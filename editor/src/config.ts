import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import * as lc from "vscode-languageclient/node";
import { Ctx } from "./ctx";
import { LabeledVersion } from './toolPreparator';
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
        "diagnostics.enable"
    ]
        .map(opt => `${this.rootSection}.${opt}`);

    constructor(ctx: vscode.ExtensionContext) {
        vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this, ctx.subscriptions);
    }

    init(ctx: Ctx) {
        this._ctx = ctx;
        vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this, ctx.extensionContext.subscriptions);
    }

    get cfg(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(this.rootSection);
    }

    public setTool4DPath(inPath: string) {
        this._tool4DPath = inPath;
    }

    private get<T>(path: string): T {
        return this.cfg.get<T>(path)!;
    }

    public tool4DWanted(): string {
        return this._tool4dVersionFromSettings;
    }

    public IsTool4DEnabled(): boolean {
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
        if (this._tool4dEnableFromSettings) {
            return this._tool4DPath;
        }
        return p;
    }

    private _getInfoplistPath()
    {
        let serverPath = this._serverPath;
        const type = os.type();
        const dirname = path.basename(serverPath);
        if (type === "Darwin" && dirname.endsWith(".app")) {
            return path.join(serverPath, "Contents", "Info.plist");
        }
        else if(type === "Windows_NT" || type === "Linux")
        {
            return path.join(serverPath, "..", "Resources", "Info.plist");
        }
        return serverPath;
    }

    get serverPath() {
        let serverPath = this._serverPath;
        const type = os.type();
        const dirname = path.basename(serverPath);
        if (type === "Darwin" && dirname.endsWith(".app")) {
            let nameExecutable = "";
            const infoPlistPath = path.join(serverPath, "Contents", "Info.plist");
            if (fs.existsSync(infoPlistPath)) {
                const content: string = fs.readFileSync(infoPlistPath).toString();
                const match = content.match(/CFBundleExecutable<\/key>\s*<string>(.*)<\/string>/mi);
                if (match !== null && match.length > 1) {
                    nameExecutable = match[1];
                }
            }

            if (nameExecutable === "") {
                nameExecutable = path.parse(serverPath).name;
            }
            serverPath = path.join(serverPath, "Contents", "MacOS", nameExecutable);
        }
        return serverPath;
    }

    public get4DVersion() : LabeledVersion{
        let labeledVersion = new LabeledVersion(0,0,0,0,false, "stable", false);

        const infoPlistPath = this._getInfoplistPath();
        if (fs.existsSync(infoPlistPath)) {
            const content: string = fs.readFileSync(infoPlistPath).toString();
            const match = content.match(/CFBundleShortVersionString<\/key>\s*<string>(.*)<\/string>/mi);
            if (match !== null && match.length > 1) {
                let matchVersion = match[1].match(/(([0-9]*R[0-9])|[0-9]+)\.([0-9]{2,})/)
                console.log(matchVersion)
                if(matchVersion)
                {
                    if(matchVersion[2])
                    {
                        labeledVersion = LabeledVersion.fromString(matchVersion[2]);
                    }
                    else if(matchVersion[1])
                    {
                        labeledVersion = LabeledVersion.fromString(matchVersion[1]);
                    }
                    if(matchVersion[3]){
                        labeledVersion.changelist = Number(matchVersion[3]);
                        if(labeledVersion.changelist > 0 && labeledVersion.version === 0) {
                            labeledVersion.main = true;
                        }
                    }
                }
            }
        }
        return labeledVersion
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