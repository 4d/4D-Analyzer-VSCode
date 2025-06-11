/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';
import { compareVersion } from './helper';
import * as fs from 'fs';

function loadArgs(inRoot) {
	const data = fs.readFileSync(path.join(inRoot, '../../.args.json'), 'utf8');

	try {
		const args = JSON.parse(data);
		for (const key in args) {
			process.env[key] = args[key];
		}
	} catch (parseError) {
		console.error('Error parsing args.json:', parseError);
	}

}
export async function run(): Promise<void> {

	
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});
	mocha.timeout(100000);

	const testsRoot = __dirname;
	loadArgs(testsRoot);
	const currentVersion: string = process.env["VERSION_4D"];
	const tests = {
		"format.test.js": "20R3"
	};
	
	const g = new glob.Glob('**.test.js', { cwd: testsRoot });
	for await (const f of g) {
		if (!currentVersion)
			continue;
		const versionFile = tests[f] ? tests[f] : currentVersion;
		if (compareVersion(currentVersion, versionFile) >= 0) {
			mocha.addFile(path.resolve(testsRoot, f));
		}
	}

	return new Promise((resolve, reject) => {
		try {
			// Run the mocha test
			mocha.run(failures => {
				if (failures > 0) {
					reject(new Error(`${failures} tests failed.`));
				} else {
					resolve();
				}
			});
		} catch (err) {
			console.error(err);
			reject(err);
		}
	});
}