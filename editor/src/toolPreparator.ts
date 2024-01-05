import * as fs from 'fs';
import * as os from 'os';
import { existsSync, mkdirSync } from "fs";
import * as child_process from 'child_process';
import * as path from 'path';


class LabeledVersion {
    public version: number;
    public releaseVersion: number;
    public subversion: number;
    public changelist: number;

    constructor(version : number, releaseVersion : number, subVersion : number, changelist : number) {
        this.version = version;
        this.releaseVersion = releaseVersion;
        this.changelist = changelist;
        this.subversion = subVersion
    }

    static fromString(inVersion: string): LabeledVersion {
        let obj: LabeledVersion = new LabeledVersion(0,0,0,0);
        let regex : RegExp = /^([0-9]{2})(R([0-9]))?(\.([0-9]*))?$/
        let regexArray = regex.exec(inVersion)
        
        if (regexArray[1]) {
            obj.version = Number(regexArray[1])
        }

        if (regexArray[3]) {
            obj.releaseVersion = Number(regexArray[3])
        }

        if (regexArray[5]) {
            obj.subversion = Number(regexArray[5])
        }

        if (regexArray[7]) {
            obj.changelist = Number(regexArray[7])
        }

        return obj;
    }

    public toString(withChangelist : boolean): string {
        let result = String(this.version)
        if(this.releaseVersion > 0)
        {
            result += "R" + this.releaseVersion
        }
        else
        {
            result += "." + this.subversion
        }
        
        if(withChangelist) {
            result += "." + this.changelist
        }
        return result
    }
}

export class ToolPreparator {
    private _versionWanted: LabeledVersion
    constructor(inVersion: string) {
        this._versionWanted = LabeledVersion.fromString(inVersion)
    }

    //TODO: not finished
    private async _getLatestAvailable() : Promise<LabeledVersion> {
        return new Promise((resolve, reject)=>{
            resolve(this._versionWanted)
        });
    }



    private _checkDownloadVersionExist(url: string): Promise<boolean> {
        const http = require('http');
        const https = require('https');

        async function download(url: string): Promise<boolean> {
            const proto = !url.charAt(4).localeCompare('s') ? https : http;
            return new Promise((resolve, reject) => {
                const request = proto.get(url, response => {

                    if (response.statusCode === 302) {
                        resolve(true)
                    }
                    else if (response.statusCode === 200) {
                        resolve(true)
                    }
                    else if (response.statusCode !== 200) {
                        reject(false)
                    }
                    else {
                        reject(false)
                    }
                    request.end();

                });
            });
        }
        return new Promise((resolve, reject) => {
            download(url).then((p) => {
                resolve(p)
            }).catch(e => {
                reject(e);
            })
        });
    }

    private _download(url: string, filePath: string): Promise<string> {
        const http = require('http');
        const https = require('https');

        async function download(url, filePath): Promise<string> {
            const proto = !url.charAt(4).localeCompare('s') ? https : http;

            return new Promise((resolve, reject) => {


                const request = proto.get(url, response => {
                    if (response.statusCode == 302) {
                        download(response.headers.location, filePath).then(r => {
                            resolve(r);
                        })
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
                            reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                        });
                        return;
                    }
                    request.end();

                });
            });
        }
        return new Promise((resolve, reject) => {
            download(url, filePath).then((p) => {
                resolve(p)
            }).catch(e => {
                reject(e);
            })
        });
    }


    //https://resources-download.4d.com/release/20.x/20.2/101024/mac/tool4d_v20.2_mac_arm.tar.xz
    //https://resources-download.4d.com/release/20%20Rx/20%20R3/latest/mac/tool4d_v20R3_mac_x86.tar.xz
    private _getURLTool4D(inVersion: LabeledVersion, inExtension: string): string {
        let url = "https://resources-download.4d.com/release/"
        const labeledVersion: LabeledVersion = inVersion

        const version: string = String(labeledVersion.version)
        const releaseVersion: string = String(labeledVersion.releaseVersion)
        const subVersion: string = String(labeledVersion.subversion)

        if (labeledVersion.releaseVersion > 0) {
            url += `${version} Rx/${version} R${releaseVersion}`
        }
        else if (labeledVersion.subversion > 0) {
            url += `${version}.x/${version}.${subVersion}`
        }
        else {
            url += `${version}.x/${version}`
        }
        url += "/latest/"

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
        url += inExtension
        //url += ".tar.xz"


        return url;
    }

    private async _decompress(input: string, inDirectory: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (!existsSync(input))
                reject();
            console.log("Untar", input)
            const childProcess = child_process.spawn("tar", [
                '-xf', input, '-C', inDirectory
            ]);

            childProcess.stderr.on('data', (chunk: Buffer) => {
                //const str = chunk.toString();
                //console.log('4D Language Server:', str);
                //this._client.outputChannel.appendLine(str);
            });

            childProcess.on('exit', (code, signal) => {
                if (code == 0) {
                    resolve()
                }
                else {
                    reject()
                }
            });

        });
    }

    private async _findValidCompressExtension(labeledVersion: LabeledVersion): Promise<string> {
        const url = this._getURLTool4D(labeledVersion, ".tar.xz");
        console.log(url)

        try {
            await this._checkDownloadVersionExist(url)
            return url;
        }
        catch (e) { }
        return undefined
    }

    private _getTool4DPath(inRootFolder: string, labeledVersion: LabeledVersion): string {
        return path.join(inRootFolder, labeledVersion.toString(true))
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
        return tool4DExecutable
    }

    public async prepareTool4D(inPathToStore: string): Promise<string> {
        return new Promise(async (resolve, reject) => {

            const labeledVersionWanted: LabeledVersion = this._versionWanted
            const labeledVersion : LabeledVersion = labeledVersionWanted;
            const globalStoragePath = inPathToStore;

            if (!existsSync(globalStoragePath)) {
                mkdirSync(globalStoragePath);
            }
            const tool4DMainFolder = path.join(globalStoragePath, "tool4d")
            if (!existsSync(tool4DMainFolder)) {
                mkdirSync(tool4DMainFolder);
            }
            const tool4D = this._getTool4DPath(tool4DMainFolder, labeledVersion)
            const zipPath = path.join(tool4D, "tool4d.compressed")
            const tool4DExecutable = this._getTool4DExe(path.join(tool4D, "tool4d"));

            if (!existsSync(tool4DExecutable)) {
                const url = await this._findValidCompressExtension(labeledVersion)

                if (!existsSync(zipPath)) {

                    if (!existsSync(tool4D)) {
                        mkdirSync(tool4D);
                    }
                    try {
                        await this._download(url, zipPath);
                    }
                    catch (error) {
                        reject(`Tool4D ${labeledVersion.toString(false)} does not exist`)
                    }
                }

                if (existsSync(zipPath)) {
                    this._decompress(zipPath, tool4D)
                        .then(() => {
                            resolve(tool4DExecutable);
                        })
                        .catch(() => {
                            reject("Cannot decompress the tool4D");
                        })
                }
            }
            else {
                resolve(tool4DExecutable);
            }
        })
    }
}