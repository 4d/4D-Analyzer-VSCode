import { getDocPath } from './helper';
import { ToolPreparator } from '../toolPreparator';
import { APIManager, requestLabelVersion } from '../apiManager';
import { LabeledVersion } from '../labeledVersion';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Mock helper to simulate tool4d being "installed"
function mockTool4DInstallation(basePath: string, version: LabeledVersion): string {
    const versionFolder = path.join(basePath, "tool4d", version.toString(false));
    const changelistFolder = path.join(versionFolder, String(version.changelist));
    const tool4dFolder = path.join(changelistFolder, "tool4d");
    
    if (!fs.existsSync(tool4dFolder)) {
        fs.mkdirSync(tool4dFolder, { recursive: true });
    }
    
    const osType = os.type();
    let tool4dPath: string;
    if (osType === "Windows_NT") {
        tool4dPath = path.join(tool4dFolder, "tool4d.exe");
    } else if (osType === "Darwin") {
        tool4dPath = path.join(tool4dFolder, "tool4d.app");
        const infoPlistPath = path.join(tool4dPath, "Contents");
        fs.mkdirSync(infoPlistPath, { recursive: true });
    } else {
        tool4dPath = path.join(tool4dFolder, "tool4d");
    }
    
    fs.writeFileSync(tool4dPath, "mock tool4d executable");
    return tool4dPath;
}

function cleanupTestFolder(folderPath: string) {
    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true });
    }
}

suite('APIManager Tests', () => {
    let apiManager: APIManager;

    setup(() => {
        apiManager = new APIManager("");
    });

    test('requestLabelVersion - should parse stable version correctly', async function() {
        this.timeout(30000);
        const url = 'https://resources-download.4d.com/release/20.x/latest/latest/win/tool4d_win.tar.xz';
        const version = await requestLabelVersion(url, "stable");
        
        assert.strictEqual(version.version, 20);
        assert.strictEqual(version.channel, "stable");
        assert.ok(version.changelist > 0, "Changelist should be greater than 0");
    });

    test('requestLabelVersion - should parse R release version correctly', async function() {
        this.timeout(30000);
        const url = 'https://resources-download.4d.com/release/20 Rx/latest/latest/win/tool4d_win.tar.xz';
        const version = await requestLabelVersion(url, "stable");
        
        assert.strictEqual(version.version, 20);
        assert.ok(version.isRRelease, "Should be an R release");
        assert.ok(version.releaseVersion >= 0, "Release version should be >= 0");
        assert.ok(version.changelist > 0, "Changelist should be greater than 0");
    });

    //The beta channel test can be flaky depending on the current available versions
    /*test('requestLabelVersion - should handle beta channel', async function() {
        this.timeout(30000);
        const url = 'https://resources-download.4d.com/release/20.x/latest/latest/win/tool4d_win.tar.xz?channel=beta';
        const version = await requestLabelVersion(url, "beta");
        
        assert.strictEqual(version.version, 20);
        assert.strictEqual(version.channel, "beta");
        assert.ok(version.changelist > 0, "Changelist should be greater than 0");
    });*/

    test('requestLabelVersion - should reject invalid URL', async function() {
        this.timeout(10000);
        const url = 'https://resources-download.4d.com/release/99.x/latest/latest/win/tool4d_win.tar.xz';
        
        try {
            await requestLabelVersion(url, "stable");
            assert.fail("Should have thrown an error");
        } catch (error) {
            assert.ok(true, "Expected error was thrown");
        }
    });

    test('getURLTool4D - should generate correct URL for LTS version', () => {
        const version = new LabeledVersion(20, 0, 0, 0, false, "stable", false);
        const url = apiManager.getURLTool4D(version, "Windows_NT");
        
        assert.ok(url.includes('20.x/latest/latest/win/tool4d_win.tar.xz'));
        assert.ok(!url.includes('channel=beta'));
    });

    test('getURLTool4D - should generate correct URL for R release', () => {
        const version = new LabeledVersion(20, 3, 0, 0, true, "stable", false);
        const url = apiManager.getURLTool4D(version, "Windows_NT");
        
        assert.ok(url.includes('20 Rx/20 R3'));
        assert.ok(url.includes('win/tool4d_win.tar.xz'));
    });

    test('getURLTool4D - should generate correct URL for latest R release', () => {
        const version = new LabeledVersion(20, 0, 0, 0, true, "stable", false);
        const url = apiManager.getURLTool4D(version, "Windows_NT");
        
        assert.ok(url.includes('20 Rx/latest'));
    });

    test('getURLTool4D - should add beta channel parameter', () => {
        const version = new LabeledVersion(20, 0, 0, 0, false, "beta", false);
        const url = apiManager.getURLTool4D(version, "Windows_NT");
        
        assert.ok(url.includes('channel=beta'));
    });

    test('getURLTool4D - should generate correct URL for macOS', () => {
        const version = new LabeledVersion(20, 0, 0, 0, false, "stable", false);
        const url = apiManager.getURLTool4D(version, "Darwin");
        
        assert.ok(url.includes('mac/tool4d_'));
        assert.ok(url.includes('.tar.xz'));
    });

    test('getURLTool4D - should generate correct URL for Linux', () => {
        const version = new LabeledVersion(20, 0, 0, 0, false, "stable", false);
        const url = apiManager.getURLTool4D(version, "Linux");
        
        assert.ok(url.includes('linux/tool4d.deb'));
    });

    test('getURLTool4D - should handle main branch with API key', () => {
        const apiManagerWithKey = new APIManager("test-api-key");
        const version = new LabeledVersion(0, 0, 0, 0, true, "stable", true);
        const url = apiManagerWithKey.getURLTool4D(version, "Windows_NT");
        
        assert.ok(url.includes('main/main'));
        assert.ok(url.includes('token_tool=test-api-key'));
    });

    test('getLastMajorVersionAvailable - should find last available major version', async function() {
        this.timeout(60000);
        const lastVersion = await apiManager.getLastMajorVersionAvailable(20, "stable");
        
        assert.ok(lastVersion >= 20, "Last version should be at least 20");
    });

    test('HasRReleaseVersionAvailable - should detect R release availability', async function() {
        this.timeout(30000);
        const hasRRelease = await apiManager.HasRReleaseVersionAvailable(20, "stable");
        
        assert.strictEqual(hasRRelease, true);
    });

    test('isCloudVersionABeta - should detect beta versions', async function() {
        this.timeout(30000);
        const version = new LabeledVersion(20, 0, 0, 12345, false, "beta", false);
        const isBeta = await apiManager.isCloudVersionABeta(version);
        
        assert.strictEqual(typeof isBeta, 'boolean');
    });

    test('getLastVersionCloud - should retrieve cloud version info', async function() {
        this.timeout(30000);
        const version = new LabeledVersion(20, 0, 0, 0, false, "stable", false);
        const cloudVersion = await apiManager.getLastVersionCloud(version);
        
        assert.strictEqual(cloudVersion.version, 20);
        assert.ok(cloudVersion.changelist > 0);
        assert.ok(['stable', 'beta'].includes(cloudVersion.channel));
    });
});

suite('ToolPreparator Tests - Unit', () => {
    test('Constructor - should parse version string correctly', () => {
        const toolPrep = new ToolPreparator("20", "stable", "");
        assert.ok(toolPrep, "ToolPreparator should be created");
    });

    test('Constructor - should handle R release version', () => {
        const toolPrep = new ToolPreparator("20R", "stable", "");
        assert.ok(toolPrep, "ToolPreparator should be created for R release");
    });

    test('Constructor - should handle specific R version', () => {
        const toolPrep = new ToolPreparator("20R3", "stable", "");
        assert.ok(toolPrep, "ToolPreparator should be created for specific R version");
    });

    test('Constructor - should handle latest version', () => {
        const toolPrep = new ToolPreparator("latest", "stable", "");
        assert.ok(toolPrep, "ToolPreparator should be created for latest");
    });

    test('Constructor - should handle main version with API key', () => {
        const toolPrep = new ToolPreparator("main", "stable", "test-api-key");
        assert.ok(toolPrep, "ToolPreparator should be created for main");
    });
});

suite('ToolPreparator Tests - With Local Mock', () => {
    teardown(() => {
        // Cleanup test folders
        const testFolders = [
            getDocPath("MockDownload"),
            getDocPath("MockDownloadR"),
            getDocPath("MockDownloadR3"),
            getDocPath("MockDownloadReuse")
        ];
        testFolders.forEach(folder => cleanupTestFolder(folder));
    });

    test('Should detect locally installed version', async function() {
        this.timeout(30000);
        const downloadPath = getDocPath("MockDownload");
        cleanupTestFolder(downloadPath);
        
        // Mock an existing tool4d installation
        const mockVersion = new LabeledVersion(20, 0, 0, 123456, false, "stable", false);
        mockTool4DInstallation(downloadPath, mockVersion);
        
        const toolPrep = new ToolPreparator("20", "stable", "");
        const result = await toolPrep.prepareLastToolWithoutProgress(downloadPath, false);
        
        assert.ok(result.currentVersion, "Should have current version");
        assert.strictEqual(result.currentVersion.version, 20);
        assert.strictEqual(result.currentVersion.releaseVersion, 0);
        assert.strictEqual(result.currentVersion.changelist, 123456);
        assert.ok(result.path, "Path should be set");
        assert.ok(fs.existsSync(result.path), "Tool path should exist");
    });

    test('Should detect locally installed R release', async function() {
        this.timeout(30000);
        const downloadPath = getDocPath("MockDownloadR");
        cleanupTestFolder(downloadPath);
        
        const mockVersion = new LabeledVersion(20, 3, 0, 123456, true, "stable", false);
        mockTool4DInstallation(downloadPath, mockVersion);
        
        const toolPrep = new ToolPreparator("20R3", "stable", "");
        const result = await toolPrep.prepareLastToolWithoutProgress(downloadPath, false);
        
        assert.ok(result.currentVersion, "Should have current version");
        assert.strictEqual(result.currentVersion.version, 20);
        assert.strictEqual(result.currentVersion.releaseVersion, 3);
        assert.ok(result.currentVersion.isRRelease, "Should be R release");
    });

    test('Should find latest R release when requesting 20R', async function() {
        this.timeout(30000);
        const downloadPath = getDocPath("MockDownloadR3");
        cleanupTestFolder(downloadPath);
        
        // Mock multiple R releases, should find the latest
        const mockVersion1 = new LabeledVersion(20, 2, 0, 100000, true, "stable", false);
        const mockVersion2 = new LabeledVersion(20, 3, 0, 120000, true, "stable", false);
        mockTool4DInstallation(downloadPath, mockVersion1);
        mockTool4DInstallation(downloadPath, mockVersion2);
        
        const toolPrep = new ToolPreparator("20R", "stable", "");
        const result = await toolPrep.prepareLastToolWithoutProgress(downloadPath, false);
        
        assert.strictEqual(result.currentVersion.releaseVersion, 3, "Should use latest R release");
    });

    test('Should reuse existing installation', async function() {
        this.timeout(30000);
        const downloadPath = getDocPath("MockDownloadReuse");
        cleanupTestFolder(downloadPath);
        
        const mockVersion = new LabeledVersion(20, 0, 0, 123456, false, "stable", false);
        mockTool4DInstallation(downloadPath, mockVersion);
        
        // First call
        const toolPrep1 = new ToolPreparator("20", "stable", "");
        const result1 = await toolPrep1.prepareLastToolWithoutProgress(downloadPath, false);
        
        // Second call should reuse
        const toolPrep2 = new ToolPreparator("20", "stable", "");
        const result2 = await toolPrep2.prepareLastToolWithoutProgress(downloadPath, false);
        
        assert.strictEqual(result1.path, result2.path);
        assert.strictEqual(result1.currentVersion.changelist, result2.currentVersion.changelist);
    });
});

suite('Integration Tests - ToolPreparator and APIManager', () => {
    test('URL generation consistency - LTS version', () => {
        const apiManager = new APIManager("");
        const version = new LabeledVersion(20, 0, 0, 0, false, "stable", false);
        const url = apiManager.getURLTool4D(version);
        
        assert.ok(url.includes('20.x/latest'), "URL should include version path");
    });

    test('URL generation consistency - R release', () => {
        const apiManager = new APIManager("");
        const version = new LabeledVersion(20, 3, 0, 0, true, "stable", false);
        const url = apiManager.getURLTool4D(version);
        
        assert.ok(url.includes('20 Rx/20 R3'), "URL should include R release path");
    });

    test('Version parsing - from constructor to API manager', () => {
        const toolPrep = new ToolPreparator("20R3", "stable", "");
        const apiManager = new APIManager("");
        
        // Verify that version strings are parsed consistently
        const parsedVersion = LabeledVersion.fromString("20R3");
        assert.strictEqual(parsedVersion.version, 20);
        assert.strictEqual(parsedVersion.releaseVersion, 3);
        assert.ok(parsedVersion.isRRelease);
    });

    test('Channel propagation - beta channel', () => {
        const version = new LabeledVersion(20, 0, 0, 0, false, "beta", false);
        const apiManager = new APIManager("");
        const url = apiManager.getURLTool4D(version);
        
        assert.ok(url.includes('channel=beta'), "Beta channel should be in URL");
    });

    test('Version comparison logic', () => {
        const oldVersion = new LabeledVersion(20, 0, 0, 100000, false, "stable", false);
        const newVersion = new LabeledVersion(20, 0, 0, 123456, false, "stable", false);
        
        const comparison = newVersion.compare(oldVersion);
        assert.ok(comparison > 0, "Newer changelist should be greater");
    });

    test('Version comparison - R releases', () => {
        const v20R2 = new LabeledVersion(20, 2, 0, 100000, true, "stable", false);
        const v20R3 = new LabeledVersion(20, 3, 0, 100000, true, "stable", false);
        
        assert.ok(v20R3.compare(v20R2) > 0, "20R3 should be greater than 20R2");
    });

    test('Version comparison - LTS vs R release', () => {
        const v20LTS = new LabeledVersion(20, 0, 0, 100000, false, "stable", false);
        const v20R2 = new LabeledVersion(20, 2, 0, 100000, true, "stable", false);
        
        assert.ok(v20R2.compare(v20LTS) > 0, "20R2 should be greater than 20 LTS");
    });


    test('Version string parsing - various formats', () => {
        const testCases = [
            { input: "20", expected: { version: 20, releaseVersion: 0, isRRelease: false } },
            { input: "20R", expected: { version: 20, releaseVersion: 0, isRRelease: true } },
            { input: "20R3", expected: { version: 20, releaseVersion: 3, isRRelease: true } },
            { input: "latest", expected: { version: 0, releaseVersion: 0, isRRelease: true } },
            { input: "main", expected: { version: 0, releaseVersion: 0, isRRelease: true, main: true } }
        ];

        testCases.forEach(testCase => {
            const parsed = LabeledVersion.fromString(testCase.input);
            assert.strictEqual(parsed.version, testCase.expected.version, `Version mismatch for ${testCase.input}`);
            assert.strictEqual(parsed.releaseVersion, testCase.expected.releaseVersion, `Release version mismatch for ${testCase.input}`);
            assert.strictEqual(parsed.isRRelease, testCase.expected.isRRelease, `isRRelease mismatch for ${testCase.input}`);
            if (testCase.expected.main !== undefined) {
                assert.strictEqual(parsed.main, testCase.expected.main, `main flag mismatch for ${testCase.input}`);
            }
        });
    });

    test('Version toString - formatting', () => {
        const testCases = [
            { version: new LabeledVersion(20, 0, 0, 123456, false, "stable", false), expected: "20" },
            { version: new LabeledVersion(20, 3, 0, 123456, true, "stable", false), expected: "20R3" },
            { version: new LabeledVersion(20, 0, 0, 123456, false, "beta", false), expected: "20B" },
            { version: new LabeledVersion(20, 3, 0, 123456, true, "beta", false), expected: "20R3B" }
        ];

        testCases.forEach(testCase => {
            const result = testCase.version.toString(false);
            assert.strictEqual(result, testCase.expected, `Format mismatch for ${testCase.expected}`);
        });
    });
});


