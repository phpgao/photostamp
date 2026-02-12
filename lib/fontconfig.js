/**
 * Fontconfig initialization (cross-platform).
 *
 * MUST be require()'d BEFORE require('sharp') so that libvips/Pango
 * picks up the FONTCONFIG_FILE environment variable on first use.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

(function initFontconfig() {
  // Skip if already configured and file exists
  if (process.env.FONTCONFIG_FILE && fs.existsSync(process.env.FONTCONFIG_FILE)) {
    return;
  }

  // On Linux with system fontconfig, the default config usually works
  if (process.platform === 'linux' && fs.existsSync('/etc/fonts/fonts.conf')) {
    return;
  }

  const fontconfigDir = path.join(os.tmpdir(), 'ph-fontconfig');
  const fontsConf = path.join(fontconfigDir, 'fonts.conf');

  if (fs.existsSync(fontsConf)) {
    process.env.FONTCONFIG_FILE = fontsConf;
    return;
  }

  // Collect system font directories per platform
  const fontDirs = [];
  const homeDir = os.homedir();

  if (process.platform === 'darwin') {
    fontDirs.push('/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts');
    if (homeDir) fontDirs.push(path.join(homeDir, 'Library', 'Fonts'));
  } else if (process.platform === 'win32') {
    const windir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
    fontDirs.push(path.join(windir, 'Fonts'));
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const userFonts = path.join(localAppData, 'Microsoft', 'Windows', 'Fonts');
      if (fs.existsSync(userFonts)) fontDirs.push(userFonts);
    }
  } else {
    // Linux / other Unix
    fontDirs.push('/usr/share/fonts', '/usr/local/share/fonts');
    if (homeDir) {
      fontDirs.push(path.join(homeDir, '.fonts'));
      fontDirs.push(path.join(homeDir, '.local', 'share', 'fonts'));
    }
  }

  const dirEntries = fontDirs
    .filter(d => fs.existsSync(d))
    .map(d => `  <dir>${d}</dir>`)
    .join('\n');

  const cacheDir = path.join(fontconfigDir, 'cache');
  const config = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
${dirEntries}
  <cachedir>${cacheDir}</cachedir>
  <match target="pattern">
    <edit name="antialias" mode="assign"><bool>true</bool></edit>
  </match>
</fontconfig>
`;

  try {
    fs.mkdirSync(fontconfigDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(fontsConf, config, 'utf-8');
    process.env.FONTCONFIG_FILE = fontsConf;
  } catch (e) {
    // Silently fail — fontconfig will use built-in defaults
  }
})();
