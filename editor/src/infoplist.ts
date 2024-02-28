import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { LabeledVersion } from './labeledVersion';

export class InfoPlistManager {
    private readonly _infoPlistPath : string
    private readonly _content : string;
    constructor(inPath : string) {
        this._infoPlistPath = inPath;
        this._content = ""
        if (fs.existsSync(this._infoPlistPath)) {
            this._content = fs.readFileSync(this._infoPlistPath).toString();
        }
    }

    private static _getInfoplistPath(inExePath : string) {
        let serverPath = inExePath;
        const type = os.type();
        const dirname = path.basename(serverPath);
        if (type === "Darwin" && dirname.endsWith(".app")) {
            return path.join(serverPath, "Contents", "Info.plist");
        }
        else if (type === "Windows_NT" || type === "Linux") {
            return path.join(serverPath, "..", "Resources", "Info.plist");
        }
        return serverPath;
    }

    public getVersion() : LabeledVersion{
        let labeledVersion = new LabeledVersion(0, 0, 0, 0, false, "stable", false);

        const match = this._content.match(/CFBundleShortVersionString<\/key>\s*<string>(.*)<\/string>/mi);
        if (match !== null && match.length > 1) {
            let matchVersion = match[1].match(/(([0-9]*R[0-9])|[0-9]+)\.([0-9]{2,})/)
            if (matchVersion) {
                if (matchVersion[2]) {
                    labeledVersion = LabeledVersion.fromString(matchVersion[2]);
                }
                else if (matchVersion[1]) {
                    labeledVersion = LabeledVersion.fromString(matchVersion[1]);
                }
                if (matchVersion[3]) {
                    labeledVersion.changelist = Number(matchVersion[3]);
                    if (labeledVersion.changelist > 0 && labeledVersion.version === 0) {
                        labeledVersion.main = true;
                    }
                }
            }
        }
        return labeledVersion;
    }

    public getExeName() : string {
        let nameExecutable = ""
        const match = this._content.match(/CFBundleExecutable<\/key>\s*<string>(.*)<\/string>/mi);
        if (match !== null && match.length > 1) {
            nameExecutable = match[1];
        }
        return nameExecutable;
    }

    static fromExePath( inPath : string) : InfoPlistManager {
        return new InfoPlistManager(InfoPlistManager._getInfoplistPath(inPath))
    }
    
}