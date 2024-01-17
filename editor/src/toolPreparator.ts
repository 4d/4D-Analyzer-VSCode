import * as fs from 'fs';
import * as os from 'os';
import { existsSync, mkdirSync, readdirSync  } from "fs";
import * as child_process from 'child_process';
import * as path from 'path';


class LabeledVersion {
    public version: number;
    public releaseVersion: number;
    public subversion: number;
    public changelist: number;
    public isRRelease : boolean;

    constructor(version: number, releaseVersion: number, subVersion: number, changelist: number) {
        this.version = version;
        this.releaseVersion = releaseVersion;
        this.changelist = changelist;
        this.subversion = subVersion;
        this.isRRelease = false;
    }

    static fromString(inVersion: string): LabeledVersion {
        const obj: LabeledVersion = new LabeledVersion(0, 0, 0, 0);
        const regex = /^([0-9]{2})(R([0-9]))?(\.([0-9]*))?$/;
        const regexArray = regex.exec(inVersion);
        if(regexArray == null)
            return obj;
        if (regexArray[1]) {
            obj.version = Number(regexArray[1]);
        }

        if (regexArray[2]) {
            obj.isRRelease = regexArray[2].includes("R");
        }

        if (regexArray[3]) {
            obj.releaseVersion = Number(regexArray[3]);
        }

        if (regexArray[5]) {
            obj.subversion = Number(regexArray[5]);
        }

        if (regexArray[7]) {
            obj.changelist = Number(regexArray[7]);
        }

        return obj;
    }

    public toString(withChangelist: boolean): string {
        let result = String(this.version);
        if (this.isRRelease) {
            result += "R" + this.releaseVersion;
        }
        else {
            result += "." + this.subversion;
        }

        if (withChangelist) {
            result += "." + this.changelist;
        }
        return result;
    }
}

export class ToolPreparator {
    private _versionWanted: LabeledVersion;
    constructor(inVersion: string) {
        this._versionWanted = LabeledVersion.fromString(inVersion);
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

    private _requestChangeList(url: string): Promise<number> {
        async function download(url: string): Promise<number> {
            const http = await import('http');
            const https = await import('https');
            const proto = !url.charAt(4).localeCompare('s') ? https : http;
            return new Promise((resolve, reject) => {
                const request = proto.get(url, response => {
                    if (response.statusCode === 302 || response.statusCode === 200) {
                        const regex = /_([0-9]{6})/;
                        const resultRegex = regex.exec(response.headers.location);
                        resolve(Number(resultRegex[1]));
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
    private _getURLTool4D(inVersion: LabeledVersion): string {
        let url = "https://resources-download.4d.com/release/";
        const labeledVersion: LabeledVersion = inVersion;

        const version = String(labeledVersion.version);
        const releaseVersion = String(labeledVersion.releaseVersion);
        const subVersion = String(labeledVersion.subversion);

        if (labeledVersion.releaseVersion > 0) {
            url += `${version} Rx/${version} R${releaseVersion}`;
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
            url += `linux/tool4d_v${labeledVersion.toString(false)}_Linux`;
        }
        else if (type == "Darwin") {
            const arch = os.arch();
            url += `mac/tool4d_v${labeledVersion.toString(false)}_mac`;
            if (arch === "arm" || arch === "arm64")
                url += "_arm";
            else
                url += "_x86";
        }
        else if (type == "Windows_NT") {
            url += `win/tool4d_v${labeledVersion.toString(false)}_win`;
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

    private async _getURLFromVersion(labeledVersion: LabeledVersion): Promise<string> {
        const url = this._getURLTool4D(labeledVersion);

        try {
            const ok = await this._checkDownloadVersionExist(url);
            if (ok)
                return url;
            else
                throw new Error(`${url} is not valid`);
        }
        catch (e) {
            throw new Error(e);
        }
    }

    private _getTool4DAvailableLocaly(inRootFolder: string, labeledVersion: LabeledVersion) : LabeledVersion {
        const getDirectories = source =>
        readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

        let localLabelVersion = labeledVersion;
        if(localLabelVersion.version == 0) {
            const versions = getDirectories(inRootFolder).sort(
                (a, b) => a.localeCompare(b, undefined, { numeric: true }));
            if(versions.length > 0) {
                localLabelVersion = LabeledVersion.fromString(versions[0]);
                return this._getTool4DAvailableLocaly(path.join(inRootFolder, versions[0]), localLabelVersion);
            }
        }

        if(localLabelVersion.releaseVersion == 0 && localLabelVersion.isRRelease) {
            const versions = getDirectories(inRootFolder).filter(version => version.startsWith(String(localLabelVersion.version)))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            if(versions.length > 0) {
                localLabelVersion = LabeledVersion.fromString(versions[0]);
                return this._getTool4DAvailableLocaly(path.join(inRootFolder, versions[0]), localLabelVersion);
            }
        }

        if(localLabelVersion.changelist == 0) {
            const versions = getDirectories(inRootFolder).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            if(versions.length > 0) {
                localLabelVersion.changelist = Number(versions[0]);
            }
        }
        return localLabelVersion;
    }

    private _getTool4DPath(inRootFolder: string, labeledVersion: LabeledVersion): string {
        const label = this._getTool4DAvailableLocaly(inRootFolder, labeledVersion);
        return path.join(inRootFolder, label.toString(false), String(label.changelist));
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

    /**
    * @throws {@link Error} If an issue occured during download/decompress
    * Download and decompress a toodl
    */
    public async prepareTool4D(inPathToStore: string): Promise<string> {
        const globalStoragePath = inPathToStore;
        const tool4DMainFolder = path.join(globalStoragePath, "tool4d");
        const labeledVersionWanted: LabeledVersion = this._versionWanted;
        let tool4DExecutable = this._getTool4DExe(path.join(this._getTool4DPath(tool4DMainFolder, labeledVersionWanted), "tool4d"));
        if (existsSync(tool4DExecutable)) {
            return tool4DExecutable;
        }

        const labeledVersion: LabeledVersion = labeledVersionWanted;
        try {
            const url = await this._getURLFromVersion(labeledVersion);
            if (labeledVersion.changelist === 0) {
                labeledVersion.changelist = await this._requestChangeList(url);
            }
        } catch (e) {
            throw new Error(`Tool4D ${labeledVersion.toString(false)} does not exist`);
        }

        if (!existsSync(globalStoragePath)) {
            mkdirSync(globalStoragePath);
        }
        if (!existsSync(tool4DMainFolder)) {
            mkdirSync(tool4DMainFolder);
        }
        const tool4D = this._getTool4DPath(tool4DMainFolder, labeledVersion);
        const zipPath = path.join(tool4D, "tool4d.compressed");
        tool4DExecutable = this._getTool4DExe(path.join(tool4D, "tool4d"));
        if (!existsSync(tool4DExecutable)) {

            if (!existsSync(zipPath)) {

                if (!existsSync(tool4D)) {
                    mkdirSync(tool4D, {recursive:true});
                }
                try {
                    const url = this._getURLTool4D(labeledVersion);
                    await this._download(url, zipPath);
                }
                catch (error) {
                    throw new Error(`Tool4D ${labeledVersion.toString(false)} does not exist`);
                }
            }

            if (existsSync(zipPath)) {
                try {
                    await this._decompress(zipPath, tool4D);
                    return tool4DExecutable;
                }
                catch (error) {
                    throw new Error("Cannot decompress the tool4D");
                }
            }
        }
        else {
            return tool4DExecutable;
        }
    }
}