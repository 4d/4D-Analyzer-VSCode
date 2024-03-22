import { LabeledVersion } from "./labeledVersion";
import * as fs from 'fs';
import * as os from 'os';
import { Logger } from './logger';
import { existsSync, mkdirSync } from "fs";
import * as path from 'path';

export function requestLabelVersion(url: string, channel: string): Promise<LabeledVersion> {
    async function download(url: string): Promise<LabeledVersion> {
        const http = require('http');
        const https = require('https');
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

export class APIManager {
    private readonly _apiKey: string;
    private readonly _packagePreference: string;
    constructor(inAPIKey: string, inPackagePreference: string) {
        this._apiKey = inAPIKey;
        this._packagePreference = inPackagePreference;
    }

    public async getLastMajorVersionAvailable(inStartMajorVersion: number, inChannel: string): Promise<number> {
        let labelVersion = new LabeledVersion(inStartMajorVersion, 0, 0, 0, false, inChannel, false);
        while (true) {
            const url = this.getURLTool4D(labelVersion);
            try {
                await requestLabelVersion(url, labelVersion.channel);
                labelVersion.version += 1;
            }
            catch (error) {
                break;
            }
        }

        return labelVersion.version - 1;
    }

    //https://resources-download.4d.com/release/20%20Rx/20%20R3/latest/mac/tool4d_v20R3_mac_x86.tar.xz
    //https://preprod-product-download.4d.com/release/20%20Rx/latest/latest/win/tool4d_win.tar.xz => Last Rx released
    //https://preprod-product-download.4d.com/release/20%20Rx/latest/latest/win/tool4d_win.tar.xz => Last Rx beta
    //https://preprod-product-download.4d.com/release/20%20Rx/20%20R3/latest/win/tool4d_win.tar.xz => Last 20R3 release
    /*
        Starting from 20R5
        Linux has tar.xz and .deb
    */
    public getURLTool4D(inVersion: LabeledVersion): string {
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
                url += `${version} Rx/latest`;
            }
            else {
                url += `${version}.x/latest`;
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
        let hasArgs = false;
        if(inVersion.isMain())
        {
            hasArgs = true;
            url += "?";
            url += "token_tool=" + this._apiKey;
        }
        else
        {
            if(!hasArgs)
            {
                url += "?";
                hasArgs = true;
            }

            if(inVersion.channel === "beta")
            {
                url += "channel=" + inVersion.channel;
            }
        }
        
        return url;
    }

    public async isCloudVersionABeta(inlabelVersion: LabeledVersion): Promise<boolean> {

        if (inlabelVersion.isMain())
            return false;
        let labelVersion = inlabelVersion.clone();
        let url = this.getURLTool4D(new LabeledVersion(labelVersion.version, labelVersion.releaseVersion, 0, 0, labelVersion.isRRelease, "stable", false));
        try {
            const labeledVersionCloudBeta = await requestLabelVersion(url, "stable");
            if (labelVersion.compare(labeledVersionCloudBeta) === 0)
                return false;
        } catch (error) {
            return true;
        }

        return false;
    }

    public async getLastVersionCloud(labeledVersionWanted: LabeledVersion): Promise<LabeledVersion> {

        let labeledVersionCloud;
        const url = this.getURLTool4D(labeledVersionWanted);
        try {
                labeledVersionCloud = await requestLabelVersion(url, labeledVersionWanted.channel);
            }
         catch (error) { 
            throw new Error(`Failed url: ${url}`);
         }
         let isBeta = await this.isCloudVersionABeta(labeledVersionCloud);

         labeledVersionCloud.channel = isBeta ? "beta" : "stable";
         return labeledVersionCloud;
        
    }

    public async downloadVersion(inlabelVersion: LabeledVersion, output: string): Promise<object> {
        const url = this.getURLTool4D(inlabelVersion);
        return this._download(url, output);
    }

    private _download(inURL: string, filePath: string): Promise<object> {
        async function download(inURL, filePath): Promise<object> {
            const http = require('http');
            const https = require('https');
            const proto = !inURL.charAt(4).localeCompare('s') ? https : http;

            return new Promise((resolve, reject) => {

                const request = proto.get(inURL, response => {
                    if (response.statusCode == 302) {
                        const regex = /_[0-9]{6,}\.([a-z]*\.?[a-z]*)/
                        const resultRegex = regex.exec(response.headers.location);
                        let fileType = "tar.xz"
                        if (resultRegex && resultRegex[1]) {
                            if (resultRegex[1] === "xz") {
                                fileType = "tar.xz";
                            }
                            else {
                                fileType = resultRegex[1];
                            }
                        }
                        download(response.headers.location, filePath + "." + fileType).then(r => {
                            resolve({ url: r, changelist: 0, fileType: fileType });
                        }).catch(error => reject(error));
                    }
                    else if (response.statusCode === 200) {
                        const file = fs.createWriteStream(filePath);
                        const parent = path.join(filePath, "..");
                        Logger.debugLog(file)
                        if (!existsSync(parent)) {
                            mkdirSync(parent, { recursive: true });
                        }
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
}