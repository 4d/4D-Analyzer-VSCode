import * as vscode from 'vscode';
import * as util from 'util' // has no default export
import { debug } from 'console';

export class Logger {
    private static instance: Logger;
    private readonly _log: vscode.OutputChannel;

    public static get(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }

        return Logger.instance;
    }

    constructor() {
        this._log = vscode.window.createOutputChannel("4D-Analyzer");
    }

    private _logInOutputChannel(...o:any) {
        Logger.debugLog(...o);
        o.forEach(item => {
            const isObject = (typeof item === 'object' && item !== null);
            this._log.appendLine(isObject ? util.inspect(item) : item);
        });

    }

    public log(...o: any) {
        
        const prefix = `[${new Date().toLocaleString()}]`;
        this._log.append(prefix + ' ');
        this._logInOutputChannel(...o)
    }

    public static debugLog(...inArgs) {
        var args = Array.prototype.slice.call(inArgs);
        args.unshift("[4D-Analyzer]")
        console.log.apply(console, args);
    }
}
