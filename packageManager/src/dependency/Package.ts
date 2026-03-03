
import * as path from 'path';
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

    /**
     * Check whether a path exists (async replacement for fsSync.existsSync)
     */
    private static async exists(p: string): Promise<boolean> {
        try {
            await fs.access(p);
            return true;
        } catch {
            return false;
        }
    }

    static async Create(root: string): Promise<Package | null> {
        const content = path.join(root, 'Contents');
        if (await Package.exists(content)) {
            root = content;
        }

        if (await Package.exists(root)) {
            if (await Package.exists(path.join(root, 'Project'))) {
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
            if (await Package.exists(depPath)) {
                const content = await fs.readFile(depPath, 'utf-8');
                return JSON.parse(content);
            }
        }
        return null;
    }

}