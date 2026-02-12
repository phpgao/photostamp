const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const log = require('./logger');

let cachedFonts = null;

const hasChinese = (s) => /[\u4e00-\u9fff]/.test(s);

/**
 * 获取系统已安装的字体列表（跨平台）
 * @returns {Array<{family: string, displayName: string}>}
 */
function getSystemFonts() {
  if (cachedFonts) return cachedFonts;

  // Strategy 1: fc-list (works on Linux, macOS with fontconfig, and if our fontconfig init ran)
  try {
    cachedFonts = getFontsViaFcList();
    if (cachedFonts.length > 0) {
      log.info('Fonts', `Found ${cachedFonts.length} font families via fc-list`);
      return cachedFonts;
    }
  } catch (e) {
    log.debug('Fonts', `fc-list not available: ${e.message}`);
  }

  // Strategy 2: Platform-specific methods
  if (process.platform === 'win32') {
    try {
      cachedFonts = getFontsViaRegistry();
      if (cachedFonts.length > 0) {
        log.info('Fonts', `Found ${cachedFonts.length} font families via registry`);
        return cachedFonts;
      }
    } catch (e) {
      log.debug('Fonts', `Registry font query failed: ${e.message}`);
    }
  }

  // Strategy 3: Scan font directories and parse font names from binary
  try {
    cachedFonts = getFontsViaScan();
    log.info('Fonts', `Found ${cachedFonts.length} font families via directory scan`);
  } catch (e) {
    log.warn('Fonts', `Font scan failed: ${e.message}`);
    cachedFonts = [];
  }

  return cachedFonts;
}

/**
 * 通过 fc-list 获取字体（需要 fontconfig 已初始化）
 *
 * fc-list %{family} 返回逗号分隔的所有别名，例如:
 *   "TencentSans,腾讯体,TencentSans W7,腾讯体 W7"
 *
 * 策略：
 * - family (option value): 使用第一个名称，fontconfig/Pango 一定能识别
 * - displayName (给用户看): 优先用中文名，没有则用 family
 */
function getFontsViaFcList() {
  const raw = execFileSync('fc-list', ['--format=%{family}\n'], {
    encoding: 'utf-8',
    env: process.env,
    timeout: 15000,
    windowsHide: true,
  });

  // Map: primary family name -> best display name
  const familyMap = new Map();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Split comma-separated family names and trim each
    const names = trimmed.split(',').map(n => n.trim()).filter(Boolean);
    if (names.length === 0) continue;

    // Skip hidden/system font families
    if (names[0].startsWith('.') || names[0] === 'System Font') continue;

    // Choose family name for Pango: prefer pure ASCII name (Pango handles English
    // family names reliably for CJK fonts, but often fails with Chinese names).
    // Also skip style-specific names that contain spaces like "TencentSans W7".
    const isAscii = (s) => /^[\x20-\x7E]+$/.test(s);
    const isBaseFamily = (s) => !/ /.test(s); // no space = not a style variant

    let family = names[0]; // fallback: first name
    for (const n of names) {
      if (isAscii(n) && isBaseFamily(n)) {
        family = n;
        break;
      }
    }
    // If no pure-ASCII base name found, try any ASCII name (even with spaces)
    if (!isAscii(family)) {
      for (const n of names) {
        if (isAscii(n)) {
          family = n;
          break;
        }
      }
    }

    // Already seen this family? skip duplicate entries (e.g. different styles)
    if (familyMap.has(family)) continue;

    // Find the best display name: prefer a short Chinese name (no style suffix)
    let displayName = family;
    for (const n of names) {
      if (hasChinese(n)) {
        if (!hasChinese(displayName) || n.length < displayName.length) {
          displayName = n;
        }
      }
    }

    familyMap.set(family, displayName);
  }

  return sortFonts([...familyMap.entries()].map(([family, displayName]) => ({ family, displayName })));
}

/**
 * Windows: 从注册表获取字体列表
 * Registry key: HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts
 */
function getFontsViaRegistry() {
  const raw = execFileSync('reg', [
    'query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/s'
  ], { encoding: 'utf-8', timeout: 10000, windowsHide: true });

  const families = new Set();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Format: "Font Name (TrueType)"    REG_SZ    filename.ttf
    const match = trimmed.match(/^\s*(.+?)\s+\((?:TrueType|OpenType|TrueType Collection)\)\s+REG_SZ\s+/i);
    if (match) {
      let name = match[1].trim();
      // Remove style suffixes
      name = name.replace(/\s+(Regular|Bold|Italic|Light|Medium|Thin|Heavy|Black|ExtraBold|SemiBold|ExtraLight|Condensed|Narrow|Compressed|Book)\s*$/i, '');
      if (name) families.add(name);
    }
  }

  // Also check per-user fonts
  try {
    const userRaw = execFileSync('reg', [
      'query', 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/s'
    ], { encoding: 'utf-8', timeout: 10000, windowsHide: true });
    for (const line of userRaw.split('\n')) {
      const trimmed = line.trim();
      const match = trimmed.match(/^\s*(.+?)\s+\((?:TrueType|OpenType|TrueType Collection)\)\s+REG_SZ\s+/i);
      if (match) {
        let name = match[1].trim();
        name = name.replace(/\s+(Regular|Bold|Italic|Light|Medium|Thin|Heavy|Black|ExtraBold|SemiBold|ExtraLight|Condensed|Narrow|Compressed|Book)\s*$/i, '');
        if (name) families.add(name);
      }
    }
  } catch (e) {
    // User fonts registry may not exist
  }

  return sortFonts([...families].map(f => ({ family: f, displayName: f })));
}

/**
 * 扫描系统字体目录，从字体文件中读取真实的字体家族名
 */
function getFontsViaScan() {
  const fontDirs = getSystemFontDirs();
  const families = new Map(); // family -> displayName
  const fontExtensions = new Set(['.ttf', '.otf', '.ttc']);

  for (const dir of fontDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      scanDir(dir, fontExtensions, families);
    } catch (e) {
      log.debug('Fonts', `Scan error in ${dir}: ${e.message}`);
    }
  }

  return sortFonts([...families.entries()].map(([family, displayName]) => ({ family, displayName })));
}

/**
 * 获取系统字体目录
 */
function getSystemFontDirs() {
  const dirs = [];
  const homeDir = os.homedir();

  if (process.platform === 'darwin') {
    dirs.push('/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts');
    if (homeDir) dirs.push(path.join(homeDir, 'Library', 'Fonts'));
  } else if (process.platform === 'win32') {
    const windir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
    dirs.push(path.join(windir, 'Fonts'));
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      dirs.push(path.join(localAppData, 'Microsoft', 'Windows', 'Fonts'));
    }
  } else {
    dirs.push('/usr/share/fonts', '/usr/local/share/fonts');
    if (homeDir) {
      dirs.push(path.join(homeDir, '.fonts'));
      dirs.push(path.join(homeDir, '.local', 'share', 'fonts'));
    }
  }

  return dirs;
}

function scanDir(dir, extensions, families) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, extensions, families);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.has(ext)) {
        try {
          const names = readFontFamilyName(fullPath, ext);
          for (const name of names) {
            if (name && !name.startsWith('.') && name !== 'System Font') {
              families.set(name, name);
            }
          }
        } catch {
          // If we can't parse the font file, use filename as fallback
          let name = path.basename(entry.name, ext);
          name = name.replace(/[-_](Regular|Bold|Italic|Light|Medium|Thin|Heavy|Black|ExtraBold|SemiBold|ExtraLight|Condensed|Compressed)$/i, '');
          if (name && !name.startsWith('.')) {
            families.set(name, name);
          }
        }
      }
    }
  }
}

/**
 * 从 TTF/OTF/TTC 文件中读取字体家族名
 * Reads the 'name' table (nameID=1 for Family, prefer platformID=3 Windows/Unicode)
 */
function readFontFamilyName(filePath, ext) {
  const fd = fs.openSync(filePath, 'r');
  try {
    if (ext === '.ttc') {
      return readTTCFamilyNames(fd);
    }
    const name = readSingleFontFamilyName(fd, 0);
    return name ? [name] : [];
  } finally {
    fs.closeSync(fd);
  }
}

function readSingleFontFamilyName(fd, offset) {
  const headerBuf = Buffer.alloc(12);
  fs.readSync(fd, headerBuf, 0, 12, offset);

  const numTables = headerBuf.readUInt16BE(4);
  const tablesBuf = Buffer.alloc(numTables * 16);
  fs.readSync(fd, tablesBuf, 0, tablesBuf.length, offset + 12);

  let nameTableOffset = 0;
  let nameTableLength = 0;

  for (let i = 0; i < numTables; i++) {
    const tag = tablesBuf.toString('ascii', i * 16, i * 16 + 4);
    if (tag === 'name') {
      nameTableOffset = tablesBuf.readUInt32BE(i * 16 + 8);
      nameTableLength = tablesBuf.readUInt32BE(i * 16 + 12);
      break;
    }
  }

  if (!nameTableOffset || nameTableLength === 0) return null;

  // Read name table (cap at 64KB for safety)
  const readLen = Math.min(nameTableLength, 65536);
  const nameBuf = Buffer.alloc(readLen);
  fs.readSync(fd, nameBuf, 0, readLen, nameTableOffset);

  const count = nameBuf.readUInt16BE(2);
  const stringOffset = nameBuf.readUInt16BE(4);

  let familyName = null;

  for (let i = 0; i < count; i++) {
    const recordOffset = 6 + i * 12;
    if (recordOffset + 12 > readLen) break;

    const platformID = nameBuf.readUInt16BE(recordOffset);
    const nameID = nameBuf.readUInt16BE(recordOffset + 6);
    const strLength = nameBuf.readUInt16BE(recordOffset + 8);
    const strOffset = nameBuf.readUInt16BE(recordOffset + 10);

    // nameID 1 = Font Family
    if (nameID !== 1) continue;

    const dataStart = stringOffset + strOffset;
    if (dataStart + strLength > readLen) continue;

    // Prefer Windows/Unicode (platformID=3) encoding for broad compatibility
    if (platformID === 3) {
      // Data is UTF-16BE, decode manually
      familyName = decodeUTF16BE(nameBuf, dataStart, strLength);
      break; // Windows name is preferred
    } else if (platformID === 1 && !familyName) {
      // Mac Roman
      familyName = nameBuf.toString('latin1', dataStart, dataStart + strLength);
    }
  }

  return familyName || null;
}

function readTTCFamilyNames(fd) {
  const headerBuf = Buffer.alloc(12);
  fs.readSync(fd, headerBuf, 0, 12, 0);

  const numFonts = headerBuf.readUInt32BE(8);
  const offsetsBuf = Buffer.alloc(numFonts * 4);
  fs.readSync(fd, offsetsBuf, 0, offsetsBuf.length, 12);

  const names = new Set();
  // Only read up to 20 fonts from a TTC to avoid excessive I/O
  const maxFonts = Math.min(numFonts, 20);
  for (let i = 0; i < maxFonts; i++) {
    const fontOffset = offsetsBuf.readUInt32BE(i * 4);
    try {
      const name = readSingleFontFamilyName(fd, fontOffset);
      if (name) names.add(name);
    } catch {
      // Skip unreadable fonts
    }
  }

  return [...names];
}

function decodeUTF16BE(buf, offset, length) {
  const chars = [];
  for (let i = 0; i < length; i += 2) {
    chars.push(buf.readUInt16BE(offset + i));
  }
  return String.fromCharCode(...chars);
}

/**
 * 排序：中文字体优先，然后按字母排序
 */
function sortFonts(fonts) {
  return fonts.sort((a, b) => {
    const aCn = hasChinese(a.displayName);
    const bCn = hasChinese(b.displayName);
    if (aCn && !bCn) return -1;
    if (!aCn && bCn) return 1;
    return a.displayName.localeCompare(b.displayName, 'zh-CN');
  });
}

/**
 * 清除缓存（在安装新字体后调用）
 */
function clearFontCache() {
  cachedFonts = null;
}

module.exports = { getSystemFonts, clearFontCache };
