
import * as path from 'path';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import AdmZip from 'adm-zip';
import { DependenciesFile } from '../types';


export class Package {
    //Location of the Project Folder or .4DZ
    private _root: string
    private _isZip = false;

    private constructor(root: string, isZip: boolean) {
        this._root = root;
        this._isZip = isZip;
    }

    static async Create(root: string): Promise<Package | null> {
        const content = path.join(root, 'Contents');
        if (fsSync.existsSync(content)) {
            root = content;
        }

        if (fsSync.existsSync(root)) {
            if (fsSync.existsSync(path.join(root, 'Project'))) {
                root = path.join(root, 'Project');
                return new Package(root, false);
            }
            else {
                let found = false;

                const entriesProject = await fs.readdir(root, { withFileTypes: true });
                for (const entry of entriesProject) {
                    if (entry.name.endsWith(".4DZ")) {
                        //Find the .4DProject inside the zip
                        root = path.join(root, entry.name);
                        found = true;
                        break;
                    }
                }
                return found ? new Package(root, true) : null;
            }
        }
        else {
            return null;
        }

    }

    async getListDependencies(): Promise<DependenciesFile | null> {
        if (this._isZip) {
            const zip = new AdmZip(this._root);
            const entry = zip.getEntry("Project/Sources/dependencies.json");
            if (entry != null) {
                const buffer = entry.getData();
                const content = buffer.toString("utf-8");
                return JSON.parse(content) as DependenciesFile;
            }
        }
        else {
            const depPath = path.join(this._root, "Sources", "dependencies.json");
            if (fsSync.existsSync(depPath)) {
                const content = await fs.readFile(depPath, 'utf-8');
                return JSON.parse(content);
            }
        }
        return null;
    }

}