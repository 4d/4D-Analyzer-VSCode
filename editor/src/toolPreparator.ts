import * as fs from 'fs';
import * as os from 'os';
import { existsSync, mkdirSync, readdirSync } from "fs";
import * as child_process from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import * as Logger from './logger'
import { LabeledVersion } from './labeledVersion';
import { InfoPlistManager } from './infoplist';

export interface ResultUpdate {
    path: string;
    currentVersion: LabeledVersion;
    lastVersion: LabeledVersion;
    updateAvailable: boolean;
}

export class ToolPreparator {
    private readonly _versionWanted: LabeledVersion;
    private readonly _API_KEY: string
    private readonly _packagePreference: string; //deb | tar
    constructor(inVersion: string, channel: string, inAPIKey: string) {
        this._versionWanted = LabeledVersion.fromString(inVersion);
        if (this._versionWanted.isLatest()) {
            this._versionWanted.main = !!inAPIKey;
        }
        this._versionWanted.channel = channel
        this._API_KEY = inAPIKey;
        this._packagePreference = this._computePackagePreference()
    }

    private _requestLabelVersion(url: string, channel: string): Promise<LabeledVersion> {
        async function download(url: string): Promise<LabeledVersion> {
            const http = await import('http');
            const https = await import('https');
            const proto = !url.charAt(4).localeCompare('s') ? https : http;
            return new Promise((resolve, reject) => {
                const request = proto.get(url, response => {
                    if (response.statusCode === 302 || response.statusCode === 200) {
                        const regex = /_(([0-9]{2})(\.(x)|R([0-9])*)?|main)_([0-9]{6})/;
                        const version = new LabeledVersion(0, 0, 0, 0, false, channel, false)
                        const resultRegex = regex.exec(response.headers.location);
                        if (resultRegex) {
                            if (resultRegex[1] && resultRegex[1] === "main") {
                                version.isRRelease = true;
                                version.main = true;
                                version.changelist = Number(resultRegex[6])
                            }
                            else {
                                version.version = Number(resultRegex[2])
                                version.isRRelease = resultRegex[3].includes("R");
                                if (version.isRRelease) {
                                    version.releaseVersion = Number(resultRegex[5])
                                }
                                version.changelist = Number(resultRegex[6])
                            }

                        }
                        else {
                            reject(false);
                        }
                        resolve(version);
                    }
                    else if (response.statusCode !== 200) {
                        reject(false);
                    }
                    else {
                        reject(false);
                    }
                    request.end();

                });
            });
        }
        return new Promise((resolve, reject) => {
            download(url).then((p) => {
                resolve(p);
            }).catch(e => {
                reject(e);
            });
        });
    }

    private async _isCloudVersionABeta(inlabelVersion: LabeledVersion): Promise<boolean> {
        if (inlabelVersion.isMain())
            return false;
        let labelVersion = inlabelVersion.clone();
        const url = this._getURLTool4D(new LabeledVersion(labelVersion.version, 0, 0, 0, labelVersion.isRRelease, "beta", false));
        try {
            const labeledVersionCloudBeta = await this._requestLabelVersion(url, "beta");
            if (labelVersion.compare(labeledVersionCloudBeta) === 0)
                return true;
        } catch (error) {
            throw error;
        }

        return false;
    }

    private _download(inURL: string, filePath: string): Promise<object> {
        async function download(inURL, filePath): Promise<object> {
            const http = await import('http');
            const https = await import('https');
            const proto = !inURL.charAt(4).localeCompare('s') ? https : http;

            return new Promise((resolve, reject) => {

                const request = proto.get(inURL, response => {
                    if (response.statusCode == 302) {
                        const regex = /_[0-9]{6,}\.([a-z]*\.?[a-z]*)/
                        const resultRegex = regex.exec(response.headers.location);
                        let fileType = "tar.xz"
                        if (resultRegex && resultRegex[1]) {
                            fileType = resultRegex[1];
                        }
                        Logger.debugLog(response.headers)
                        download(response.headers.location, filePath + "." + fileType).then(r => {
                            resolve({ url: r, changelist: 0, fileType: fileType });
                        }).catch(error => reject(error));
                    }
                    else if (response.statusCode === 200) {
                        const file = fs.createWriteStream(filePath);
                        const parent = path.join(filePath, "..")
                        if (!existsSync(parent)) {
                            mkdirSync(parent, { recursive: true });
                        }
                        let fileInfo = null;

                        fileInfo = {
                            mime: response.headers['content-type'],
                            size: parseInt(response.headers['content-length'], 10),
                        };
                        Logger.debugLog("fileinfo", fileInfo)

                        response.pipe(file);

                        // The destination stream is ended by the time it's called
                        file.on('finish', () => resolve(fileInfo));

                        request.on('error', err => {
                            fs.unlink(filePath, () => reject(err));
                        });

                        file.on('error', err => {
                            fs.unlink(filePath, () => reject(err));
                        });

                    }
                    else if (response.statusCode !== 200) {
                        fs.unlink(filePath, () => {
                            reject(new Error(`Failed to get '${inURL}' (${response.statusCode})`));
                        });
                    }
                    else {
                        reject(new Error(`Failed to get '${inURL}' (${response.statusCode})`));
                    }
                    request.end();

                });
            });
        }
        return new Promise((resolve, reject) => {
            download(inURL, filePath).then((p) => {
                resolve(p);
            }).catch(e => {
                reject(e);
            });
        });
    }


    //https://resources-download.4d.com/release/20.x/20.2/101024/mac/tool4d_v20.2_mac_arm.tar.xz
    //https://resources-download.4d.com/release/20%20Rx/20%20R3/latest/mac/tool4d_v20R3_mac_x86.tar.xz
    //https://preprod-product-download.4d.com/release/20%20Rx/latest/latest/win/tool4d_win.tar.xz => Last Rx released
    //https://preprod-product-download.4d.com/release/20%20Rx/beta/latest/win/tool4d_win.tar.xz => Last Rx beta
    //https://preprod-product-download.4d.com/release/20%20Rx/20%20R3/latest/win/tool4d_win.tar.xz => Last 20R3 release
    /*
        Starting from 20R5
        Linux has tar.xz and .deb
    */
    private _getURLTool4D(inVersion: LabeledVersion): string {
        let url = "https://preprod-product-download.4d.com/release/";
        const labeledVersion: LabeledVersion = inVersion;

        const version = String(labeledVersion.version);
        const releaseVersion = String(labeledVersion.releaseVersion);
        const hasLinuxDeb: boolean = this._packagePreference === "deb"
            && (labeledVersion.isMain()
                || (labeledVersion.version >= 20 && labeledVersion.releaseVersion >= 5))

        if (labeledVersion.isMain()) {
            url += "main/main";
        }
        else {
            if (labeledVersion.releaseVersion > 0) {
                url += `${version} Rx/${version} R${releaseVersion}`;
            }
            else if (labeledVersion.isRRelease && labeledVersion.releaseVersion === 0) {
                url += `${version} Rx/`;
                if (labeledVersion.channel === "stable") {
                    url += "latest"
                }
                else {
                    url += "beta"
                }
            }
            else {
                url += `${version}.x/${version}`;
            }
        }

        url += "/latest/";

        const type = os.type();

        if (type == "Linux") {
            if (hasLinuxDeb) {
                url += `linux/tool4d.deb`;
            }
            else {
                url += `linux/tool4d_Linux.tar.xz`;
            }
        }
        else if (type == "Darwin") {
            const arch = os.arch();
            url += `mac/tool4d_mac`;
            if (arch === "arm" || arch === "arm64")
                url += "_arm";
            else
                url += "_x86";
            url += ".tar.xz";
        }
        else if (type == "Windows_NT") {
            url += `win/tool4d_win`;
            url += ".tar.xz";
        }

        if (labeledVersion.isMain()) {
            url += "?"
            url += "token_tool=" + this._API_KEY
        }

        return url;
    }

    private async _decompress(input: string, inDirectory: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!existsSync(input))
                reject();
            Logger.debugLog("Untar", input);
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
                .sort((a, b) => a.version - b.version);

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
                const lastVersion = versions_all[versions_all.length - 1]
                localLabelVersion.changelist = Number(lastVersion);
            }
        }

        return localLabelVersion;
    }
//        tool4DExecutable = this._getTool4DExe(path.join(this._getTool4DPath(tool4DMainFolder, labelVersionToGet, true), "tool4d"));

    private _getTool4DPath(inRootFolder: string, labeledVersion: LabeledVersion, compute: boolean): string {
        let label = labeledVersion;
        if (compute) {
            label = this._getTool4DAvailableLocally(inRootFolder, labeledVersion);
            return this._getTool4DPath(inRootFolder, label, false)
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
        else if(osType === "Linux") {
            if (this._packagePreference === "deb") {
                tool4DExecutable = "/opt/tool4d/tool4d"
            }
            else {
                tool4DExecutable = path.join(inRootFolder, "bin", "tool4d");
            }
        }
        return tool4DExecutable;
    }

    private async _getLastMajorVersionAvailable(inStartMajorVersion: number, inChannel): Promise<number> {
        let labelVersion = new LabeledVersion(inStartMajorVersion, 0, 0, 0, false, inChannel, false);
        while (true) {
            const url = this._getURLTool4D(labelVersion);
            try {
                await this._requestLabelVersion(url, labelVersion.channel);
                labelVersion.version += 1;
            }
            catch (error) {
                break;
            }
        }

        return labelVersion.version - 1;
    }

    private async _getLastVersionCloud(labeledVersionWanted: LabeledVersion): Promise<LabeledVersion> {
        const url = this._getURLTool4D(labeledVersionWanted);
        try {
            let labeledVersionCloud = await this._requestLabelVersion(url, "stable");
            const labeledVersionWantedIsBeta = await this._isCloudVersionABeta(labeledVersionCloud);
            labeledVersionCloud.channel = labeledVersionWantedIsBeta ? "beta" : "stable"
            return labeledVersionCloud;
        } catch (error) {
            throw error;
        }

    }

    private _computePackagePreference(): string {
        let wantTar = "tar";
        if (os.type() === "Linux") {
            try {
                child_process.execSync("sudo -v", { shell: '/bin/bash', timeout: 100 })
                wantTar = "deb"
            } catch (err) {
                wantTar = "tar";
            }
        }
        return wantTar;
    }


    public async prepareLastTool(inPathToStore: string, inUpdateIfNeeded: boolean): Promise<ResultUpdate> {
        let result = { path: "", updateAvailable: false } as ResultUpdate;
        

        const globalStoragePath = inPathToStore;
        const tool4DMainFolder = path.join(globalStoragePath, "tool4d");
        const labeledVersionWanted: LabeledVersion = this._versionWanted.clone();
        const labelVersionAvailableLocally = this._getTool4DAvailableLocally(tool4DMainFolder, labeledVersionWanted);

        Logger.debugLog("Version wanted", this._versionWanted)
        let lastMajorVersion = labeledVersionWanted.version;
        let tool4DExecutable = ""
        let labelVersionToGet = labelVersionAvailableLocally;

        try {
            if (labeledVersionWanted.isLatest() && !labeledVersionWanted.isMain()) {
                lastMajorVersion = await this._getLastMajorVersionAvailable(21, labeledVersionWanted.channel);
                labeledVersionWanted.version = lastMajorVersion;
                Logger.debugLog("lastVersion available is", labeledVersionWanted.version)
            }

            const labeledVersionCloud = await this._getLastVersionCloud(labeledVersionWanted)
            if (labeledVersionCloud.changelist === 0 && labelVersionAvailableLocally.changelist === 0) { //version unknown
                throw new Error(`Tool4D ${labeledVersionWanted.toString(false)} does not exist`);
            }

            Logger.debugLog("Version available cloud", labeledVersionCloud)
            Logger.debugLog("Version available locally", labelVersionAvailableLocally)
            Logger.debugLog("compare", labeledVersionCloud.compare(labelVersionAvailableLocally))
            if (labelVersionAvailableLocally.changelist > 0
                && labeledVersionCloud.isRRelease == labelVersionAvailableLocally.isRRelease
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
            throw new Error(`Tool4D ${labeledVersionWanted.toString(false)} does not exist`);
        }
        Logger.debugLog("Version to get", labelVersionToGet)

        if(os.type() === "Linux" && this._packagePreference === "deb")
        {
            if(labelVersionToGet.compare(InfoPlistManager.fromExePath(this._getTool4DExe("")).getVersion()) === 0) {
                tool4DExecutable = this._getTool4DExe("");
            }
            else
            {
                tool4DExecutable = "";
            }
        }
        else
        {
            tool4DExecutable = this._getTool4DExe(path.join(this._getTool4DPath(tool4DMainFolder, labelVersionToGet, true), "tool4d"));
        }

        if (existsSync(tool4DExecutable)) {
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
        if (!existsSync(tool4DExecutable)) {
            if (!(existsSync(tarPath) || existsSync(debPath))) {

                try {
                    const url = this._getURLTool4D(labelVersionToGet);

                    await this._download(url, compressedPath);
                }
                catch (error) {
                    throw new Error(`Tool4D ${labelVersionToGet.toString(false)} does not exist`);
                }
            }
            if (existsSync(tarPath)) {
                try {
                    await this._decompress(tarPath, tool4D);
                    result.path = tool4DExecutable;
                }
                catch (error) {
                    throw new Error("Cannot decompress the tool4D");
                }
            }
            else if (existsSync(debPath)) {
                try {
                    child_process.execSync(`sudo dpkg --remove tool4d`, { shell: '/bin/bash' }) //remove previous version
                    child_process.execSync(`sudo apt-get update`, { shell: '/bin/bash' }) //update apt to get missing packages
                    child_process.execSync(`sudo apt --fix-broken install --yes ${debPath}`, { shell: '/bin/bash' }) //install tool4d
                    result.path = "/opt/tool4d/tool4d"; //always there, it depends on the .deb
                } catch (err) {
                    throw new Error("Cannot install the tool4D:\n" + err);
                }
            }
        }
        else {
            result.path = tool4DExecutable;
        }
        return result;
    }

    /**
    * @throws {@link Error} If an issue occured during download/decompress
    * Download and decompress a toodl
    */
    public async prepareTool4D(inPathToStore: string): Promise<ResultUpdate> {

        try {
            let result = await this.prepareLastTool(inPathToStore, false);
            if (result.updateAvailable) {
                let command = async () => {
                    const userResponse = await vscode.window.showInformationMessage(
                        `4D ${result.lastVersion.toString(true)} is available, you have ${result.currentVersion.toString(true)}. Would you like to download it?`,
                        "Download",
                        "Continue"
                    );

                    if (userResponse === "Download") {
                        vscode.commands.executeCommand('4d-analyzer.updateTool4D');
                    }
                }
                command();
            }
            return result;

        } catch (error) {
            throw error;
        }

    }
}