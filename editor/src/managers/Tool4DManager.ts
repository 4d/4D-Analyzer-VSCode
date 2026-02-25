import { Config } from "../config";
import { LabeledVersion } from '../labeledVersion';
import { ResultUpdate, ToolPreparator } from "../tool4D/toolPreparator";
import { existsSync, readdirSync, rm, rmdirSync } from "fs";
import * as path from "path";

export class Tool4DManager {

    constructor(
        private _config: Config,
        private _globalStoragePath: string
    ) {}

    public async prepareTool4D(inVersion: string, inLocation: string, inChannel: string): Promise<ResultUpdate> {
        const toolPreparator: ToolPreparator = new ToolPreparator(inVersion, inChannel, this._config.tool4dAPIKEY());
        const outLocation = !inLocation ? this._globalStoragePath : inLocation;
        return toolPreparator.prepareTool4D(outLocation);
    }

    public async cleanUnusedToolVersions() {
        function getDirectories(source: string) {
            if (existsSync(source)) {
                return readdirSync(source, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
            }
            return [];
        }

        const location = path.join(!this._config.tool4DLocation() ? this._globalStoragePath : this._config.tool4DLocation(), "tool4d");
        if (!this._config.serverPath) //no path are ready
        {
            rmdirSync(location);
        }
        else {
            const labeledVersion = this.get4DVersion();

            const labeledVersionWithoutChangelist = labeledVersion.clone();
            labeledVersionWithoutChangelist.changelist = 0;
            const directories = getDirectories(location);
            directories.forEach(async directory => {
                const currentLabeledFolder = LabeledVersion.fromString(directory);

                if (currentLabeledFolder.compare(labeledVersionWithoutChangelist) != 0) {
                    rm(path.join(location, directory), { recursive: true }, () => { });
                }
                else {
                    const directoriesChangelist = getDirectories(path.join(location, directory));
                    directoriesChangelist.forEach(async dir => {
                        if (Number(dir) != labeledVersion.changelist) {
                            rm(path.join(location, directory, dir), { recursive: true }, () => { });
                        }
                    });
                }
            });
        }
    }

    public async downloadLastTool4D(): Promise<ResultUpdate> {
        const toolPreparator: ToolPreparator = new ToolPreparator(this._config.tool4DWanted(), this._config.tool4DDownloadChannel(), this._config.tool4dAPIKEY());
        const outLocation = !this._config.tool4DLocation() ? this._globalStoragePath : this._config.tool4DLocation();
        return toolPreparator.prepareLastTool(outLocation, true);
    }

    public get4DVersion(): LabeledVersion {
        return this._config.get4DVersion();
    }
}
