import { getDocPath } from './helper';
import { ToolPreparator } from '../tool4D/toolPreparator';
import { APIManager, requestLabelVersion } from '../tool4D/apiManager';
import { LabeledVersion } from '../labeledVersion';
import {
    createLTSVersion,
    createLatestRVersion,
    createPreviousRVersion,
    createRVersion,
    LTS_RELEASE_CHANGELIST,
    LTS_RELEASE_VERSION,
    LTS_VERSION,
    LTS_VERSION_LABEL,
    R_LATEST_RELEASE_CHANGELIST,
    R_PREVIOUS_VERSION,
    R_PREVIOUS_RELEASE_CHANGELIST,
    R_PREVIOUS_RELEASE_VERSION,
    R_PREVIOUS_VERSION_LABEL,
    R_RELEASE_CHANGELIST,
    R_RELEASE_VERSION,
    R_VERSION,
    R_VERSION_LABEL,
    R_VERSION_URL_SEGMENT
} from './versionTestConstants';
import assert from "assert";
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
        const macOSFolder = path.join(tool4dPath, "Contents", "MacOS");
        fs.mkdirSync(macOSFolder, { recursive: true });
        tool4dPath = path.join(macOSFolder, "tool4d");
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
        const url = `https://resources-download.4d.com/release/${LTS_VERSION}.x/latest/latest/win/tool4d_win.tar.xz`;
        const version = await requestLabelVersion(url, "stable");
        
        assert.strictEqual(version.version, LTS_VERSION);
        assert.strictEqual(version.channel, "stable");
        assert.ok(version.changelist > 0, "Changelist should be greater than 0");
    });

    test('requestLabelVersion - should parse R release version correctly', async function() {
        this.timeout(30000);
        const url = `https://resources-download.4d.com/release/${R_VERSION} Rx/latest/latest/win/tool4d_win.tar.xz`;
        const version = await requestLabelVersion(url, "stable");
        
        assert.strictEqual(version.version, R_VERSION);
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
        const version = createLTSVersion();
        const url = apiManager.getURLTool4D(version, "Windows_NT");
        
        assert.ok(url.includes(`${LTS_VERSION}.x/latest/latest/win/tool4d_win.tar.xz`));
        assert.ok(!url.includes('channel=beta'));
    });

    test('getURLTool4D - should generate correct URL for R release', () => {
        const version = createRVersion();
        const url = apiManager.getURLTool4D(version, "Windows_NT");
        
        assert.ok(url.includes(R_VERSION_URL_SEGMENT));
        assert.ok(url.includes('win/tool4d_win.tar.xz'));
    });

    test('getURLTool4D - should generate correct URL for latest R release', () => {
        const version = createLatestRVersion();
        const url = apiManager.getURLTool4D(version, "Windows_NT");
        
        assert.ok(url.includes(`${R_VERSION} Rx/latest`));
    });

    test('getURLTool4D - should add beta channel parameter', () => {
        const version = createLTSVersion(0, "beta");
        const url = apiManager.getURLTool4D(version, "Windows_NT");
        
        assert.ok(url.includes('channel=beta'));
    });

    test('getURLTool4D - should generate correct URL for macOS', () => {
        const version = createLTSVersion();
        const url = apiManager.getURLTool4D(version, "Darwin");
        
        assert.ok(url.includes('mac/tool4d_'));
        assert.ok(url.includes('.tar.xz'));
    });

    test('getURLTool4D - should generate correct URL for Linux', () => {
        const version = createLTSVersion();
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
        const lastVersion = await apiManager.getLastMajorVersionAvailable(LTS_VERSION, "stable");
        
        assert.ok(lastVersion >= LTS_VERSION, `Last version should be at least ${LTS_VERSION}`);
    });

    test('HasRReleaseVersionAvailable - should detect R release availability', async function() {
        this.timeout(30000);
        const hasRRelease = await apiManager.HasRReleaseVersionAvailable(R_VERSION, "stable");
        
        assert.strictEqual(hasRRelease, true);
    });

    test('isCloudVersionABeta - should detect beta versions', async function() {
        this.timeout(30000);
        const version = createLTSVersion(12345, "beta");
        const isBeta = await apiManager.isCloudVersionABeta(version);
        
        assert.strictEqual(typeof isBeta, 'boolean');
    });

    test('getLastVersionCloud - should retrieve cloud version info', async function() {
        this.timeout(30000);
        const version = createLTSVersion();
        const cloudVersion = await apiManager.getLastVersionCloud(version);
        
        assert.strictEqual(cloudVersion.version, LTS_VERSION);
        assert.ok(cloudVersion.changelist > 0);
        assert.ok(['stable', 'beta'].includes(cloudVersion.channel));
    });
});

suite('ToolPreparator Tests - Unit', () => {
    test('Constructor - should parse version string correctly', () => {
        const toolPrep = new ToolPreparator(LTS_VERSION_LABEL, "stable", "");
        assert.ok(toolPrep, "ToolPreparator should be created");
    });

    test('Constructor - should handle R release version', () => {
        const toolPrep = new ToolPreparator(`${R_VERSION}R`, "stable", "");
        assert.ok(toolPrep, "ToolPreparator should be created for R release");
    });

    test('Constructor - should handle specific R version', () => {
        const toolPrep = new ToolPreparator(R_VERSION_LABEL, "stable", "");
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
            getDocPath("MockDownloadRLatest"),
            getDocPath("MockDownloadReuse")
        ];
        testFolders.forEach(folder => cleanupTestFolder(folder));
    });

    test('Should detect locally installed version', async function() {
        this.timeout(30000);
        const downloadPath = getDocPath("MockDownload");
        cleanupTestFolder(downloadPath);
        
        // Mock an existing tool4d installation
        const mockVersion = createLTSVersion(LTS_RELEASE_CHANGELIST);
        mockTool4DInstallation(downloadPath, mockVersion);
        
        const toolPrep = new ToolPreparator(LTS_VERSION_LABEL, "stable", "");
        const result = await toolPrep.prepareLastToolWithoutProgress(downloadPath, false);
        
        assert.ok(result.currentVersion, "Should have current version");
        assert.strictEqual(result.currentVersion.version, LTS_VERSION);
        assert.strictEqual(result.currentVersion.releaseVersion, LTS_RELEASE_VERSION);
        assert.strictEqual(result.currentVersion.changelist, LTS_RELEASE_CHANGELIST);
        assert.ok(result.path, "Path should be set");
        assert.ok(fs.existsSync(result.path), "Tool path should exist");
    });

    test('Should detect locally installed R release', async function() {
        this.timeout(30000);
        const downloadPath = getDocPath("MockDownloadR");
        cleanupTestFolder(downloadPath);
        
        const mockVersion = createRVersion(R_RELEASE_CHANGELIST);
        mockTool4DInstallation(downloadPath, mockVersion);
        
        const toolPrep = new ToolPreparator(R_VERSION_LABEL, "stable", "");
        const result = await toolPrep.prepareLastToolWithoutProgress(downloadPath, false);
        
        assert.ok(result.currentVersion, "Should have current version");
        assert.strictEqual(result.currentVersion.version, R_VERSION);
        assert.strictEqual(result.currentVersion.releaseVersion, R_RELEASE_VERSION);
        assert.ok(result.currentVersion.isRRelease, "Should be R release");
    });

    test('Should find latest R release when requesting 20R', async function() {
        this.timeout(30000);
        const downloadPath = getDocPath("MockDownloadRLatest");
        cleanupTestFolder(downloadPath);
        
        // Mock multiple R releases, should find the latest
        const mockVersion1 = createPreviousRVersion(R_PREVIOUS_RELEASE_CHANGELIST);
        const mockVersion2 = createRVersion(R_LATEST_RELEASE_CHANGELIST);
        mockTool4DInstallation(downloadPath, mockVersion1);
        mockTool4DInstallation(downloadPath, mockVersion2);
        
        const toolPrep = new ToolPreparator(`${R_VERSION}R`, "stable", "");
        const result = await toolPrep.prepareLastToolWithoutProgress(downloadPath, false);
        
        assert.strictEqual(result.currentVersion.releaseVersion, R_RELEASE_VERSION, "Should use latest R release");
    });

    test('Should reuse existing installation', async function() {
        this.timeout(30000);
        const downloadPath = getDocPath("MockDownloadReuse");
        cleanupTestFolder(downloadPath);
        
        const mockVersion = createLTSVersion(LTS_RELEASE_CHANGELIST);
        mockTool4DInstallation(downloadPath, mockVersion);
        
        // First call
        const toolPrep1 = new ToolPreparator(LTS_VERSION_LABEL, "stable", "");
        const result1 = await toolPrep1.prepareLastToolWithoutProgress(downloadPath, false);
        
        // Second call should reuse
        const toolPrep2 = new ToolPreparator(LTS_VERSION_LABEL, "stable", "");
        const result2 = await toolPrep2.prepareLastToolWithoutProgress(downloadPath, false);
        
        assert.strictEqual(result1.path, result2.path);
        assert.strictEqual(result1.currentVersion.changelist, result2.currentVersion.changelist);
    });
});

suite('Integration Tests - ToolPreparator and APIManager', () => {
    test('URL generation consistency - LTS version', () => {
        const apiManager = new APIManager("");
        const version = createLTSVersion();
        const url = apiManager.getURLTool4D(version);
        
        assert.ok(url.includes(`${LTS_VERSION}.x/latest`), "URL should include version path");
    });

    test('URL generation consistency - R release', () => {
        const apiManager = new APIManager("");
        const version = createRVersion();
        const url = apiManager.getURLTool4D(version);
        
        assert.ok(url.includes(R_VERSION_URL_SEGMENT), "URL should include R release path");
    });

    test('Version parsing - from constructor to API manager', () => {
        const toolPrep = new ToolPreparator(R_VERSION_LABEL, "stable", "");
        const apiManager = new APIManager("");
        
        // Verify that version strings are parsed consistently
        const parsedVersion = LabeledVersion.fromString(R_VERSION_LABEL);
        assert.strictEqual(parsedVersion.version, R_VERSION);
        assert.strictEqual(parsedVersion.releaseVersion, R_RELEASE_VERSION);
        assert.ok(parsedVersion.isRRelease);
    });

    test('Channel propagation - beta channel', () => {
        const version = createLTSVersion(0, "beta");
        const apiManager = new APIManager("");
        const url = apiManager.getURLTool4D(version);
        
        assert.ok(url.includes('channel=beta'), "Beta channel should be in URL");
    });

    test('Version comparison logic', () => {
        const oldVersion = createLTSVersion(100000);
        const newVersion = createLTSVersion(LTS_RELEASE_CHANGELIST);
        
        const comparison = newVersion.compare(oldVersion);
        assert.ok(comparison > 0, "Newer changelist should be greater");
    });

    test('Version comparison - R releases', () => {
        const previousRVersion = createPreviousRVersion(100000);
        const currentRVersion = createRVersion(100000);
        
        assert.ok(previousRVersion.compare(currentRVersion) > 0, `${R_VERSION_LABEL} should be lower than ${R_PREVIOUS_VERSION_LABEL}`);
    });

    test('Version comparison - LTS vs R release', () => {
        const v20LTS = createLTSVersion(100000);
        const previousRVersion = createPreviousRVersion(100000);
        
        assert.ok(previousRVersion.compare(v20LTS) > 0, `${R_PREVIOUS_VERSION}R${R_PREVIOUS_RELEASE_VERSION} should be greater than ${LTS_VERSION_LABEL} LTS`);
    });


    test('Version string parsing - various formats', () => {
        const testCases = [
            { input: LTS_VERSION_LABEL, expected: { version: LTS_VERSION, releaseVersion: LTS_RELEASE_VERSION, isRRelease: false } },
            { input: `${R_PREVIOUS_VERSION}R`, expected: { version: R_PREVIOUS_VERSION, releaseVersion: 0, isRRelease: true } },
            { input: R_VERSION_LABEL, expected: { version: R_VERSION, releaseVersion: R_RELEASE_VERSION, isRRelease: true } },
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
            { version: createLTSVersion(LTS_RELEASE_CHANGELIST), expected: LTS_VERSION_LABEL },
            { version: createRVersion(R_RELEASE_CHANGELIST), expected: R_VERSION_LABEL },
            { version: createLTSVersion(LTS_RELEASE_CHANGELIST, "beta"), expected: `${LTS_VERSION_LABEL}B` },
            { version: createRVersion(R_RELEASE_CHANGELIST, "beta"), expected: `${R_VERSION_LABEL}B` }
        ];

        testCases.forEach(testCase => {
            const result = testCase.version.toString(false);
            assert.strictEqual(result, testCase.expected, `Format mismatch for ${testCase.expected}`);
        });
    });
});
