import * as os from 'os';
import { existsSync, mkdirSync, readdirSync } from "fs";
import * as child_process from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { LabeledVersion } from './labeledVersion';
import { InfoPlistManager } from './infoplist';
import { window, ProgressLocation } from 'vscode';
import { Logger } from './logger';
import { APIManager } from './apiManager';

export interface ResultUpdate {
    path: string;
    currentVersion: LabeledVersion;
    lastVersion: LabeledVersion;
    updateAvailable: boolean;
}


export class ToolPreparator {
    private readonly _versionWanted: LabeledVersion;
    private readonly _APIManager: APIManager;
    constructor(inVersion: string, channel: string, inAPIKey: string) {
        this._versionWanted = LabeledVersion.fromString(inVersion);
        if (this._versionWanted.isLatest()) {
            this._versionWanted.main = !!inAPIKey;
        }
        this._versionWanted.channel = channel;
        this._APIManager = new APIManager(inAPIKey);
    }

    private async _decompress(input: string, inDirectory: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!existsSync(input))
                reject();
            const childProcess = child_process.spawn("tar", [
                '-xf', input, '-C', inDirectory
            ]);

            childProcess.on('exit', (code) => {
                if (code == 0) {
                    resolve();
                }
                else {
                    reject();
                }
            });
        });
    }

    private _getTool4DAvailableLocally(inRootFolder: string, labeledVersion: LabeledVersion): LabeledVersion {

        function getDirectories(source: string) {
            if (existsSync(source)) {
                return readdirSync(source, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
            }
            return [];
        }


        let localLabelVersion = labeledVersion.clone();
        if (localLabelVersion.version == 0 && !localLabelVersion.isMain()) {
            const versions = getDirectories(inRootFolder)
                .map(version => LabeledVersion.fromString(version))
                .filter(version => labeledVersion.channel === "beta" ? true : version.channel === "stable")
                .sort((a, b) => { if(a.version == b.version){ return a.releaseVersion - b.releaseVersion } 
                else { return a.version - b.version } });

            if (versions.length > 0) {
                localLabelVersion = versions[versions.length - 1];
                if (labeledVersion.isMain()) {
                    if (versions[0].version === 0) {
                        localLabelVersion = versions[0];
                        return this._getTool4DAvailableLocally(inRootFolder, localLabelVersion);
                    }
                    else {
                        //issue
                    }
                }
                else {
                    return this._getTool4DAvailableLocally(inRootFolder, localLabelVersion);
                }
            }
        }
        else if (localLabelVersion.releaseVersion == 0 && localLabelVersion.isRRelease && !localLabelVersion.isMain()) {
            const versions = getDirectories(inRootFolder)
                .map(version => LabeledVersion.fromString(version))
                .filter(version => labeledVersion.channel === "beta" ? true : version.channel === "stable")
                .sort((a, b) => a.releaseVersion - b.releaseVersion);

            if (versions.length > 0) {

                localLabelVersion = versions[versions.length - 1];
                return this._getTool4DAvailableLocally(inRootFolder, localLabelVersion);
            }
        }
        else if (localLabelVersion.changelist == 0) {

            //last of all
            const versions_all = getDirectories(path.join(inRootFolder, localLabelVersion.toString(false)))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            if (versions_all.length > 0) {
                const lastVersion = versions_all[versions_all.length - 1];
                localLabelVersion.changelist = Number(lastVersion);
            }
        }

        return localLabelVersion;
    }

    private _getTool4DPath(inRootFolder: string, labeledVersion: LabeledVersion, compute: boolean): string {
        let label = labeledVersion;
        if (compute) {
            label = this._getTool4DAvailableLocally(inRootFolder, labeledVersion);
            return this._getTool4DPath(inRootFolder, label, false);
        }
        const name = String(label.changelist);

        return path.join(inRootFolder, label.toString(false), name);
    }

    private _getTool4DExe(inRootFolder: string): string {
        let tool4DExecutable = "";
        const osType = os.type();
        if (osType === "Windows_NT") {
            tool4DExecutable = path.join(inRootFolder, "tool4d", "tool4d.exe");
        }
        else if (osType === "Darwin") {
            tool4DExecutable = path.join(inRootFolder, "tool4d.app");
        }
        else if (osType === "Linux") {
            tool4DExecutable = "/opt/tool4d/tool4d";
        }
        return tool4DExecutable;
    }

    private _computeSudoRights(): boolean {
        if (os.type() === "Linux") {
            try {
                child_process.execSync("sudo -v", { shell: '/bin/bash', timeout: 1000 });
                return true;
            } catch (err) {
                return false;
            }
        }
        return false;
    }

    private async _prepareLastTool(inPathToStore: string, inUpdateIfNeeded: boolean, inProgress: vscode.Progress<{
        message?: string;
        increment?: number;
    }>): Promise<ResultUpdate> {
        const result = { path: "", updateAvailable: false } as ResultUpdate;
        let progress = 0;

        const globalStoragePath = inPathToStore;
        const tool4DMainFolder = path.join(globalStoragePath, "tool4d");
        const labeledVersionWanted: LabeledVersion = this._versionWanted.clone();
        const labelVersionAvailableLocally = this._getTool4DAvailableLocally(tool4DMainFolder, labeledVersionWanted);

        Logger.get().log("Version wanted", this._versionWanted);


        let lastMajorVersion = labeledVersionWanted.version;
        let tool4DExecutable = "";
        let labelVersionToGet = labelVersionAvailableLocally;

        inProgress?.report({ increment: 10 });
        progress += 10;
        let sudoPassword : string | undefined= undefined;

        try {
            if (labeledVersionWanted.isLatest() && !labeledVersionWanted.isMain()) {
                lastMajorVersion = await this._APIManager.getLastMajorVersionAvailable(21, labeledVersionWanted.channel);
                const hasRRelease = await this._APIManager.HasRReleaseVersionAvailable(lastMajorVersion, labeledVersionWanted.channel);
                labeledVersionWanted.version = lastMajorVersion;
                labeledVersionWanted.isRRelease = hasRRelease;
                Logger.get().log("lastVersion major version available is", labeledVersionWanted.version);
            }


            const labeledVersionCloud = await this._APIManager.getLastVersionCloud(labeledVersionWanted);
            if (labeledVersionCloud.changelist === 0 && labelVersionAvailableLocally.changelist === 0) { //version unknown
                throw new Error(`Tool4D ${labeledVersionWanted.toString(false)} does not exist`);
            }
            if (os.type() === "Linux") {
                if (!this._computeSudoRights()) {
                    let inputOption : vscode.InputBoxOptions = {
                        prompt: "Please enter your sudo password",
                        password: true
                    };
                    const userResponse = await vscode.window.showInputBox(inputOption);
                    if (userResponse) {
                        sudoPassword = userResponse;
                    }
                    else {
                        throw new Error(`Missing sudo rights`);
                    }
                }
            }

            Logger.get().log("Version available cloud", labeledVersionCloud);
            Logger.get().log("Version available locally", labelVersionAvailableLocally);
            if (labelVersionAvailableLocally.changelist > 0
                && labeledVersionCloud.compare(labelVersionAvailableLocally) > 0) {
                result.updateAvailable = true;
            }

            labelVersionToGet = labelVersionAvailableLocally;
            if ((result.updateAvailable && inUpdateIfNeeded) || labelVersionAvailableLocally.changelist === 0) {
                labelVersionToGet = labeledVersionCloud;
            }

            result.currentVersion = labelVersionToGet;
            result.lastVersion = labeledVersionCloud;
        } catch (error) {
            throw new Error(`Tool4D ${labeledVersionWanted.toString(false)} does not exist:${error}`);
        }

        progress += 10;
        inProgress?.report({ message: `Prepare version ${labelVersionToGet.toString(true)}`, increment: 10 });

        Logger.get().log("Version to get", labelVersionToGet);

        if (os.type() === "Linux") {
            if (labelVersionToGet.compare(InfoPlistManager.fromExePath(this._getTool4DExe("")).getVersion()) === 0) {
                tool4DExecutable = this._getTool4DExe("");
            }
            else {
                tool4DExecutable = "";
            }
        }
        else {
            tool4DExecutable = this._getTool4DExe(path.join(this._getTool4DPath(tool4DMainFolder, labelVersionToGet, true), "tool4d"));
        }

        if (existsSync(tool4DExecutable)) {
            inProgress?.report({ message: `Found on disk ${labelVersionToGet.toString(true)}`, increment: 100 - progress });

            result.path = tool4DExecutable;
            return result;
        }

        if (!existsSync(globalStoragePath)) {
            mkdirSync(globalStoragePath);
        }
        if (!existsSync(tool4DMainFolder)) {
            mkdirSync(tool4DMainFolder);
        }

        const tool4D = this._getTool4DPath(tool4DMainFolder, labelVersionToGet, false);

        const compressedPath = path.join(tool4D, "tool4d.compressed");
        const tarPath = compressedPath + ".tar.xz";
        const debPath = compressedPath + ".deb";


        tool4DExecutable = this._getTool4DExe(tool4D);
        Logger.get().log("Exe path", tool4DExecutable);

        if (!existsSync(tool4DExecutable)) {
            if (!(existsSync(tarPath) || existsSync(debPath))) {

                try {
                    progress += 30;
                    inProgress?.report({ message: `Download ${labelVersionToGet.toString(true)} ...`, increment: 30 });
                    await this._APIManager.downloadVersion(labelVersionToGet, compressedPath);
                }
                catch (error) {
                    throw new Error(`Cannot download ${labelVersionToGet.toString(false)}: ${error}`);
                }
            }
            if (existsSync(tarPath)) {
                try {
                    progress += 30;
                    inProgress?.report({ message: `Untar ${labelVersionToGet.toString(true)} ...`, increment: 30 });

                    await this._decompress(tarPath, tool4D);
                    result.path = tool4DExecutable;
                }
                catch (error) {
                    throw new Error("Cannot decompress the tool4D");
                }
            }
            else if (existsSync(debPath)) {
                try {
                    progress += 10;
                    inProgress?.report({ message: `Install ${labelVersionToGet.toString(true)} ...`, increment: 10 });
                    const prepareSudo = sudoPassword ? `echo ${sudoPassword} | sudo -S` : "sudo";
                    child_process.execSync(`${prepareSudo} dpkg --remove tool4d`, { shell: '/bin/bash' }); //remove previous version
                    child_process.execSync(`${prepareSudo} apt-get update`, { shell: '/bin/bash' }); //update apt to get missing packages
                    child_process.execSync(`${prepareSudo} apt --fix-broken install --yes ${debPath}`, { shell: '/bin/bash' }); //install tool4d
                    result.path = "/opt/tool4d/tool4d"; //always there, it depends on the .deb
                } catch (err) {
                    throw new Error("Cannot install the tool4D:\n" + err);
                }
            }
        }
        else {
            result.path = tool4DExecutable;
        }
        inProgress?.report({ message: `Installed`, increment: 100 - progress });
        return result;
    }

    public async prepareLastToolWithoutProgress(inPathToStore: string, inUpdateIfNeeded: boolean): Promise<ResultUpdate> {
        return this._prepareLastTool(inPathToStore, inUpdateIfNeeded, null);
    }

    public async prepareLastTool(inPathToStore: string, inUpdateIfNeeded: boolean): Promise<ResultUpdate> {
        return window.withProgress({
            location: ProgressLocation.Notification,
            title: "Prepare tool4D",
            cancellable: false
        }, async (progress, token) => {
            progress.report({ increment: 0 });

            return this._prepareLastTool(inPathToStore, inUpdateIfNeeded, progress);
        });
    }

    /**
    * @throws {@link Error} If an issue occured during download/decompress
    * Download and decompress a toodl
    */
    public async prepareTool4D(inPathToStore: string): Promise<ResultUpdate> {
        const result = await this.prepareLastTool(inPathToStore, false);
        if (result.updateAvailable) {
            const command = async () => {
                const userResponse = await vscode.window.showInformationMessage(
                    `4D ${result.lastVersion.toString(true)} is available, you have ${result.currentVersion.toString(true)}. Would you like to download it?`,
                    "Download",
                    "Continue"
                );
                if (userResponse === "Download") {
                    vscode.commands.executeCommand('4d-analyzer.updateTool4D');
                }
            };
            command();
        }
        return result;
    }
}