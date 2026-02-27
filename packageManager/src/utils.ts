import * as path from 'path';
import * as os from 'os';

/**
 * Get default cache folder based on platform
 */
export function getDefaultCacheFolder(): string {
    const platform = os.platform();
    const homeDir = os.homedir();

    switch (platform) {
        case 'darwin': // macOS
            return path.join(homeDir, 'Library', 'Caches', '4D', 'Dependencies');
        case 'win32': // Windows
            return path.join(homeDir, 'AppData', 'Local', '4D', 'Dependencies');
        case 'linux':
            return path.join(homeDir, '.cache', '4d', 'dependencies');
        default:
            return path.join(homeDir, '.4d', 'dependencies');
    }
}
