import { getDocPath } from './helper';
import { ToolPreparator, requestLabelVersion } from '../toolPreparator';
import { LabeledVersion } from '../labeledVersion';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from "fs";

//https://preprod-product-download.4d.com/release/20.x/latest/latest/win/tool4d_win.tar.xz?debug
suite('Download tool', () => {
    const downloadPath = getDocPath("Download")
    if(fs.existsSync(downloadPath)) {
        fs.rmSync(downloadPath, {recursive:true})
    }
    fs.mkdirSync(downloadPath)

	const ext = vscode.extensions.getExtension('4D.4d-analyzer')!;
    test('Tool download stable', async () => {
        let number = 21;
        await ext.activate();

        while (true) {
            try {
                await requestLabelVersion(`https://preprod-product-download.4d.com/release/${number}.x/latest/latest/win/tool4d_win.tar.xz`, "stable")
                number++;
            }
            catch (error) {
                break;
            }
        }


        number--;
        let lastVersionAvailable = await requestLabelVersion(`https://preprod-product-download.4d.com/release/${number} Rx/latest/latest/win/tool4d_win.tar.xz`, "stable")
        lastVersionAvailable.changelist = 0;


        await testDownloadR(downloadPath, lastVersionAvailable, "stable");
        if (lastVersionAvailable.releaseVersion >= 2) {
            await testDownloadRVersion(downloadPath, lastVersionAvailable, "stable");
        }
        await testDownloadLTS(downloadPath, lastVersionAvailable, "stable");
    });

    test('Tool download beta', async () => {
        let number = 21;
        await ext.activate();

        while (true) {
            try {
                await requestLabelVersion(`https://preprod-product-download.4d.com/release/${number}.x/latest/latest/win/tool4d_win.tar.xz`, "stable")
                number++;
            }
            catch (error) {
                break;
            }
        }


        number--;
        let lastVersionAvailable = await requestLabelVersion(`https://preprod-product-download.4d.com/release/${number} Rx/beta/latest/win/tool4d_win.tar.xz`, "beta")
        lastVersionAvailable.changelist = 0;


        await testDownloadR(downloadPath, lastVersionAvailable, "beta");
        if (lastVersionAvailable.releaseVersion >= 2) {
            await testDownloadRVersion(downloadPath, lastVersionAvailable, "beta");
        }
        await testDownloadLTS(downloadPath, lastVersionAvailable, "beta");
    });
});



async function testDownloadR(downloadPath: string, labeledVersion: LabeledVersion, channel : string) {
    if (labeledVersion.releaseVersion >= 2) {
        try {
            let toolPreparator = new ToolPreparator(String(labeledVersion.version) + "R", channel, "")
            let result = await toolPreparator.prepareLastToolWithoutProgress(downloadPath, false)
            assert(result.currentVersion)
            assert(result.currentVersion.version === labeledVersion.version)
            assert(result.currentVersion.releaseVersion === labeledVersion.releaseVersion)
            assert(result.currentVersion.changelist > 0)
        } catch (e) {
            console.log("ERROR", e)
            assert(false)
        }
    }
    else //If We are a 20R2
    {
        try {
            let toolPreparator = new ToolPreparator(String(labeledVersion.version) + "R", channel, "")
            let result = await toolPreparator.prepareLastToolWithoutProgress(downloadPath, false)
            assert(false)
        } catch (e) {
            assert(true)
        }
    }
}

async function testDownloadRVersion(downloadPath: string, labeledVersion: LabeledVersion, channel : string) {
    try {
        let toolPreparator = new ToolPreparator(String(labeledVersion.version) + "R" + labeledVersion.releaseVersion, channel, "")
        let result = await toolPreparator.prepareLastToolWithoutProgress(downloadPath, false)
        assert(result.currentVersion)
        assert(result.currentVersion.version === labeledVersion.version)
        assert(result.currentVersion.releaseVersion === labeledVersion.releaseVersion)
        assert(result.currentVersion.changelist > 0)
    } catch (e) {
        assert(false)
    }
}


async function testDownloadLTS(downloadPath: string, labeledVersion: LabeledVersion, channel : string) {
    if (labeledVersion.releaseVersion > 2) {
        try {
            let toolPreparator = new ToolPreparator(String(labeledVersion.version), channel, "")
            let result = await toolPreparator.prepareLastToolWithoutProgress(downloadPath, false)
            assert(result.currentVersion.version == labeledVersion.version)
            assert(result.currentVersion.releaseVersion === 0)
            assert(result.currentVersion.changelist > 0)
        } catch (e) {
            assert(false)
        }
    }
    else //If We are a 20R2
    {
        assert(true)
    }
}


