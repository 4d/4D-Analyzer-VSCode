import * as fs from 'fs';
import * as os from 'os';
import { existsSync, mkdirSync, readdirSync } from "fs";
import * as child_process from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ResultUpdate
{
    path: string;
    updateAvailable:boolean;
}
class LabeledVersion {
    public version: number = 0;
    public releaseVersion: number = 0;
    public subversion: number = 0;
    public changelist: number = 0;
    public isRRelease: boolean = false;
    public channel: string = "stable";

    constructor(version: number, releaseVersion: number, subVersion: number, changelist: number, isRRelease: boolean, channel: string) {
        this.version = version;
        this.releaseVersion = releaseVersion;
        this.changelist = changelist;
        this.subversion = subVersion;
        this.isRRelease = isRRelease;
        this.channel = channel;
    }

    clone() {
        return new LabeledVersion(this.version, this.releaseVersion, this.subversion, this.changelist, this.isRRelease, this.channel)
    }

    isLatest() {
        return this.version === 0 && this.isRRelease && this.releaseVersion === 0;
    }

    compare(b: LabeledVersion): number {
        if (this.version != b.version) {
            return this.version - b.version;
        }
        else if (this.isRRelease && b.isRRelease && this.releaseVersion != b.releaseVersion) {
            return this.releaseVersion - b.releaseVersion;
        }
        return this.changelist - b.changelist;
    }

    static fromString(inVersion: string): LabeledVersion {
        const obj: LabeledVersion = new LabeledVersion(0, 0, 0, 0, false, "stable");

        const regex = /^latest|([0-9]{2})(R([0-9]*|x))?$/;
        const regexArray = regex.exec(inVersion);
        if (regexArray == null)
            return obj;
        if (regexArray[0] && regexArray[0] === "latest") {
            obj.isRRelease = true;
            return obj;
        }
        if (regexArray[1]) {
            obj.version = Number(regexArray[1]);
        }

        if (regexArray[2]) {
            obj.isRRelease = regexArray[2].includes("R");
        }

        if (regexArray[3]) {
            if (regexArray[3] && regexArray[3] === "x")
                obj.releaseVersion = 0;
            else
                obj.releaseVersion = Number(regexArray[3]);
        }
        return obj;
    }

    public toString(withChangelist: boolean): string {
        let result = String(this.version);
        if (this.isRRelease) {
            result += "R" + this.releaseVersion;
        }
        else {
            if (this.subversion > 0)
                result += "." + this.subversion;
        }

        if (withChangelist) {
            result += "." + this.changelist;
        }
        return result;
    }
}

export class ToolPreparator {
    private readonly _versionWanted: LabeledVersion;
    constructor(inVersion: string, channel: string) {
        this._versionWanted = LabeledVersion.fromString(inVersion);
        this._versionWanted.channel = channel
    }

    //TODO: not finished
    private async _getLatestAvailable(): Promise<LabeledVersion> {
        return new Promise((resolve, reject) => {
            resolve(this._versionWanted);
        });
    }

    private _checkDownloadVersionExist(url: string): Promise<boolean> {
        async function download(url: string): Promise<boolean> {
            const http = await import('http');
            const https = await import('https');
            const proto = !url.charAt(4).localeCompare('s') ? https : http;
            return new Promise((resolve, reject) => {
                const request = proto.get(url, response => {

                    if (response.statusCode === 302) {
                        resolve(true);
                    }
                    else if (response.statusCode === 200) {
                        resolve(true);
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

    private _requestLabelVersion(url: string): Promise<LabeledVersion> {
        async function download(url: string): Promise<LabeledVersion> {
            const http = await import('http');
            const https = await import('https');
            const proto = !url.charAt(4).localeCompare('s') ? https : http;
            return new Promise((resolve, reject) => {
                const request = proto.get(url, response => {
                    if (response.statusCode === 302 || response.statusCode === 200) {
                        const regex = /_([0-9]{2})(\.(x)|R([0-9])*)?_([0-9]{6})/;
                        const version = new LabeledVersion(0, 0, 0, 0, false, "stable")
                        const resultRegex = regex.exec(response.headers.location);
                        if(resultRegex)
                        {
                            version.version = Number(resultRegex[1])
                            version.isRRelease = resultRegex[2].includes("R");
                            if (version.isRRelease) {
                                version.releaseVersion = Number(resultRegex[4])
                            }
                            version.changelist = Number(resultRegex[5])
                        }
                        else
                        {
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

    private _download(inURL: string, filePath: string): Promise<object> {
        async function download(inURL, filePath): Promise<object> {
            const http = await import('http');
            const https = await import('https');
            const proto = !inURL.charAt(4).localeCompare('s') ? https : http;

            return new Promise((resolve, reject) => {

                const request = proto.get(inURL, response => {
                    if (response.statusCode == 302) {
                        download(response.headers.location, filePath).then(r => {
                            resolve({ url: r, changelist: 0 });
                        });
                    }
                    else if (response.statusCode === 200) {
                        const file = fs.createWriteStream(filePath);
                        let fileInfo = null;

                        fileInfo = {
                            mime: response.headers['content-type'],
                            size: parseInt(response.headers['content-length'], 10),
                        };

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
                        return;
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
    private _getURLTool4D(inVersion: LabeledVersion): string {
        let url = "https://preprod-product-download.4d.com/release/";
        const labeledVersion: LabeledVersion = inVersion;

        const version = String(labeledVersion.version);
        const releaseVersion = String(labeledVersion.releaseVersion);
        const subVersion = String(labeledVersion.subversion);

        if (labeledVersion.releaseVersion > 0) {
            url += `${version} Rx/${version} R${releaseVersion}`;
        }
        else if (labeledVersion.isRRelease && labeledVersion.releaseVersion === 0) {
            url += `${version} Rx/`;
            if (labeledVersion.channel === "stable") {
                url += "lastest"
            }
            else {
                url += "beta"
            }
        }
        else if (labeledVersion.subversion > 0) {
            url += `${version}.x/${version}.${subVersion}`;
        }
        else {
            url += `${version}.x/${version}`;
        }
        url += "/latest/";

        const type = os.type();

        if (type == "Linux") {
            url += `linux/tool4d_Linux`;
        }
        else if (type == "Darwin") {
            const arch = os.arch();
            url += `mac/tool4d_mac`;
            if (arch === "arm" || arch === "arm64")
                url += "_arm";
            else
                url += "_x86";
        }
        else if (type == "Windows_NT") {
            url += `win/tool4d_win`;
        }
        url += ".tar.xz";


        return url;
    }

    private async _decompress(input: string, inDirectory: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!existsSync(input))
                reject();
            console.log("Untar", input);
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
        if (localLabelVersion.version == 0) {
            const versions = getDirectories(inRootFolder)
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            if (versions.length > 0) {
                localLabelVersion = LabeledVersion.fromString(versions[versions.length - 1]);
                return this._getTool4DAvailableLocally(inRootFolder, localLabelVersion);
            }
        }
        else if (localLabelVersion.releaseVersion == 0 && localLabelVersion.isRRelease) {
            const versions = getDirectories(inRootFolder)
                .filter(version => version.startsWith(String(localLabelVersion.version)))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            if (versions.length > 0) {
                localLabelVersion = LabeledVersion.fromString(versions[versions.length - 1]);
                return this._getTool4DAvailableLocally(inRootFolder, localLabelVersion);
            }
        }
        else if (localLabelVersion.changelist == 0) {

            //last of all
            const versions_all = getDirectories(path.join(inRootFolder, localLabelVersion.toString(false)))
                .map(a => a.includes("_") ? a.replace("_beta", "") : a)
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            
            if (versions_all.length > 0) {
                const lastVersion = versions_all[versions_all.length - 1]
                const version = lastVersion.includes("_") ? lastVersion.replace("_beta", "") : lastVersion
                localLabelVersion.changelist = Number(version);
            }
        }

        return localLabelVersion;
    }

    private _getTool4DPath(inRootFolder: string, labeledVersion: LabeledVersion, compute: boolean): string {
        let label = labeledVersion;
        if (compute) {
            label = this._getTool4DAvailableLocally(inRootFolder, labeledVersion);
            return this._getTool4DPath(inRootFolder, label, false)
        }
        let name = String(label.changelist);
        name += labeledVersion.channel === "beta" ? "_beta" : "";

        return path.join(inRootFolder, label.toString(false), name);
    }

    private _getTool4DExe(inRootFolder: string): string {
        let tool4DExecutable = "";
        const osType = os.type();
        if (osType === "Windows_NT") {
            tool4DExecutable = path.join(inRootFolder, "tool4d.exe");
        }
        else if (osType == "Darwin") {
            tool4DExecutable = path.join(inRootFolder, "tool4d.app");
        }
        else {
            tool4DExecutable = path.join(inRootFolder, "tool4d");
        }
        return tool4DExecutable;
    }

    private async _getLastMajorVersionAvailable(inStartMajorVersion : number, inChannel) : Promise<number>
    {
        let labelVersion = new LabeledVersion(inStartMajorVersion, 0,0,0,false,inChannel);
        while(true) {
            const url = this._getURLTool4D(labelVersion);
            try{
                const labelVersionReceived = await this._requestLabelVersion(url);
                labelVersion.version+=1;
            }
            catch(error)
            {
                break;
            }
        }

        return labelVersion.version - 1;
    }

    public async prepareLastTool(inPathToStore: string, inUpdateIfNeeded : boolean): Promise<ResultUpdate> {
        let result = {path:"", updateAvailable:false} as ResultUpdate;

        const globalStoragePath = inPathToStore;
        const tool4DMainFolder = path.join(globalStoragePath, "tool4d");
        const labeledVersionWanted: LabeledVersion = this._versionWanted.clone();
        const labelVersionAvailableLocally = this._getTool4DAvailableLocally(tool4DMainFolder, labeledVersionWanted);

        console.log("Version wanted", this._versionWanted)
        let lastMajorVersion = labeledVersionWanted.version;
        if(labeledVersionWanted.isLatest()) {
            lastMajorVersion = await this._getLastMajorVersionAvailable(21, labeledVersionWanted.channel);
            labeledVersionWanted.version = lastMajorVersion;
            console.log("lastVersion available is", labeledVersionWanted.version)
        }
        console.log("last version wanted available in cloud", labeledVersionWanted)

        const url = this._getURLTool4D(labeledVersionWanted);
        console.log(url)
        const labeledVersionCloud = await this._requestLabelVersion(url);
        console.log("Version availble cloud", labeledVersionCloud)
        console.log("Version availble locally", labelVersionAvailableLocally)
        console.log("compare", labeledVersionCloud.compare(labelVersionAvailableLocally))
        let tool4DExecutable = ""
        if (labelVersionAvailableLocally.changelist > 0 
            && labeledVersionCloud.isRRelease == labelVersionAvailableLocally.isRRelease
            && labeledVersionCloud.compare(labelVersionAvailableLocally) > 0) {
                result.updateAvailable = true;
        }

        let labelVersionToGet = labelVersionAvailableLocally;
        if(result.updateAvailable && inUpdateIfNeeded)
        {
            labelVersionToGet = labeledVersionCloud;
        }
        console.log("Version to get", labelVersionToGet)

        tool4DExecutable = this._getTool4DExe(path.join(this._getTool4DPath(tool4DMainFolder, labelVersionToGet, true), "tool4d"));
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
        const zipPath = path.join(tool4D, "tool4d.compressed");
        tool4DExecutable = this._getTool4DExe(tool4D);
        if (!existsSync(tool4DExecutable)) {

            if (!existsSync(zipPath)) {

                if (!existsSync(tool4D)) {
                    mkdirSync(tool4D, { recursive: true });
                }
                try {
                    const url = this._getURLTool4D(labelVersionToGet);
                    await this._download(url, zipPath);
                }
                catch (error) {
                    throw new Error(`Tool4D ${labelVersionToGet.toString(false)} does not exist`);
                }
            }

            if (existsSync(zipPath)) {
                try {
                    await this._decompress(zipPath, tool4D);
                    result.path = tool4DExecutable;

                    return result;
                }
                catch (error) {
                    throw new Error("Cannot decompress the tool4D");
                }
            }
        }
        else {
            result.path = tool4DExecutable;
            return result;
        }
    }

    /**
    * @throws {@link Error} If an issue occured during download/decompress
    * Download and decompress a toodl
    */
    public async prepareTool4D(inPathToStore: string): Promise<string> {

        let result = await this.prepareLastTool(inPathToStore, false);
        if(result.updateAvailable) {
            let command = async () => {
                const userResponse = await vscode.window.showInformationMessage(
                    `A new version of 4D is available, do you want to download it?`,
                    "Download",
                    "Continue"
                );
    
                if (userResponse === "Download") {
                    vscode.commands.executeCommand('4d-analyzer.updateTool4D');
                }
            }
            command();
        }
        return result.path;
    }
}