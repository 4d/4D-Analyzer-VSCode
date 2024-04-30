/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';
import { compareVersion } from './helper';


export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});
	mocha.timeout(100000);

	const testsRoot = __dirname;
	const currentVersion: string = process.env["VERSION_4D"];
	const tests = {
		"format.test.js": "20R3"
	};

	return new Promise((resolve, reject) => {
		glob('**.test.js', { cwd: testsRoot }, (err, files) => {
			if (err) {
				return reject(err);
			}


			// Add files to the test suite
			files.filter(f => {
				if(!currentVersion)
					return true;
				const versionFile = tests[f] ? tests[f] : currentVersion;
				return compareVersion(currentVersion, versionFile) >= 0;
			})
				.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

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
	});
}