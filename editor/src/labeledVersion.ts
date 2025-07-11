import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';


export class LabeledVersion {
    public version: number = 0;
    public releaseVersion: number = 0;
    public subversion: number = 0;
    public changelist: number = 0;
    public isRRelease: boolean = false;
    public channel: string = "stable"; //or beta
    public main: boolean = false;

    constructor(version: number, releaseVersion: number, subVersion: number, changelist: number, isRRelease: boolean, channel: string, main: boolean) {
        this.version = version;
        this.releaseVersion = releaseVersion;
        this.changelist = changelist;
        this.subversion = subVersion;
        this.isRRelease = isRRelease;
        this.channel = channel;
        this.main = main;
    }

    clone() {
        const labeledVersion = new LabeledVersion(this.version, this.releaseVersion, this.subversion, this.changelist, this.isRRelease, this.channel, this.main);
        return labeledVersion;
    }

    isLatest() {
        return this.version === 0 && this.isRRelease && this.releaseVersion === 0;
    }

    isMain() {
        return this.main;
    }
    compare(b: LabeledVersion): number {

        //Main is version 0R0
        if (this.isMain() && b.isMain()) {
            return this.changelist - b.changelist;
        }
        else if (this.isMain() && !b.isMain())
            return 1;
        else if (b.isMain() && !this.isMain())
            return -1;


        if (this.version != b.version) {
            return this.version - b.version;
        }
        else if (this.isRRelease && b.isRRelease && this.releaseVersion != b.releaseVersion) {
            return this.releaseVersion - b.releaseVersion;
        }
        else if (this.isRRelease != b.isRRelease && this.releaseVersion != b.releaseVersion) {
            return this.releaseVersion - b.releaseVersion;
        }
        return this.changelist - b.changelist;
    }

    static fromString(inVersion: string): LabeledVersion {
        const obj: LabeledVersion = new LabeledVersion(0, 0, 0, 0, false, "stable", false);

        const regex = /^latest|main$|^([0-9]+)(R([0-9]*|x))?(B)?$/;
        const regexArray = regex.exec(inVersion);
        if (regexArray == null)
            return obj;
        if (regexArray[0] && regexArray[0] === "latest") {
            obj.isRRelease = true;
            return obj;
        }
        if (regexArray[0] && regexArray[0] === "main") {
            obj.isRRelease = true;
            obj.main = true;
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

        if (regexArray[4]) {
            obj.channel = regexArray[4].includes("B") ? "beta" : "stable";
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
        if (this.channel === "beta") {
            result += "B";
        }

        return result;
    }

    public display(): string {
        let result = String(this.version);
        if (this.isRRelease) {
            result += "R" + this.releaseVersion;
        }
        return result;
    }

    public toCompatibilityVersion(): any {
        if (this.compare(LabeledVersion.fromString("20R9")) >= 0) {
            let temp = String(this.version);
            if (this.isRRelease) {
                temp += this.releaseVersion.toString(16).toUpperCase();
                temp += '0';
            }
            return temp;
        }
        else {
            let temp = String(this.version);
            if (this.isRRelease) {
                temp += this.releaseVersion.toString();
                temp += '0';
            }
            return Number(temp);
        }
    }

    private _getInfoplistPath(inExePath: string) {
        const serverPath = inExePath;
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

    public get4DVersion(inExePath: string): LabeledVersion {
        let labeledVersion = new LabeledVersion(0, 0, 0, 0, false, "stable", false);

        const infoPlistPath = this._getInfoplistPath(inExePath);
        if (fs.existsSync(infoPlistPath)) {
            const content: string = fs.readFileSync(infoPlistPath).toString();
            const match = content.match(/CFBundleShortVersionString<\/key>\s*<string>(.*)<\/string>/mi);
            if (match !== null && match.length > 1) {
                const matchVersion = match[1].match(/(([0-9]+R[0-9]+)|[0-9]+)\.([0-9]{2,})/);
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
        }
        return labeledVersion;
    }
}
