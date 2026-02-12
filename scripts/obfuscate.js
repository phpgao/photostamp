/**
 * Pre-build obfuscation script.
 * Run BEFORE electron-builder — obfuscates JS source files in place,
 * backing up originals so they can be restored after build.
 *
 * Usage:
 *   node scripts/obfuscate.js          — obfuscate source files (backup originals)
 *   node scripts/obfuscate.js restore   — restore original files from backup
 */
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(PROJECT_ROOT, '.obfuscate-backup');

// Obfuscation config — balanced between protection and performance
const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  debugProtection: true,
  debugProtectionInterval: 2000,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  reservedNames: ['^require$', '^module$', '^exports$', '^__dirname$', '^__filename$'],
  reservedStrings: ['^electron$', '^sharp$', '^exifreader$', '^path$', '^fs$', '^child_process$', '^https$', '^http$', '^zlib$'],
};

// Lighter config for renderer JS (better UI performance)
const RENDERER_OPTIONS = {
  ...OBFUSCATOR_OPTIONS,
  controlFlowFlatteningThreshold: 0.3,
  deadCodeInjection: false,
  debugProtection: true,
  debugProtectionInterval: 2000,
  selfDefending: true,
};

// JS files to obfuscate (relative to project root)
const TARGET_FILES = [
  'main.js',
  'preload.js',
  'lib/watermark.js',
  'lib/exif.js',
  'lib/geocoder.js',
  'lib/fontconfig.js',
  'lib/fonts.js',
  'lib/logger.js',
  'renderer/app.js',
  'renderer/i18n.js',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function obfuscate() {
  console.log('[Obfuscate] Starting source file obfuscation...');
  ensureDir(BACKUP_DIR);

  let success = 0;
  let failed = 0;

  for (const relPath of TARGET_FILES) {
    const srcPath = path.join(PROJECT_ROOT, relPath);
    if (!fs.existsSync(srcPath)) {
      console.log(`  - ${relPath} (not found, skipping)`);
      continue;
    }

    // Backup original
    const backupPath = path.join(BACKUP_DIR, relPath);
    ensureDir(path.dirname(backupPath));
    fs.copyFileSync(srcPath, backupPath);

    // Choose config based on path
    const isRenderer = relPath.startsWith('renderer');
    const options = isRenderer ? RENDERER_OPTIONS : OBFUSCATOR_OPTIONS;

    try {
      const code = fs.readFileSync(srcPath, 'utf-8');
      const result = JavaScriptObfuscator.obfuscate(code, options);
      fs.writeFileSync(srcPath, result.getObfuscatedCode(), 'utf-8');
      console.log(`  ✓ ${relPath}`);
      success++;
    } catch (err) {
      console.error(`  ✗ ${relPath}: ${err.message}`);
      // Restore from backup on failure
      fs.copyFileSync(backupPath, srcPath);
      failed++;
    }
  }

  console.log(`[Obfuscate] Done — ${success} obfuscated, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

function restore() {
  console.log('[Obfuscate] Restoring original source files...');

  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('[Obfuscate] No backup found, nothing to restore');
    return;
  }

  let restored = 0;
  for (const relPath of TARGET_FILES) {
    const backupPath = path.join(BACKUP_DIR, relPath);
    const srcPath = path.join(PROJECT_ROOT, relPath);
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, srcPath);
      console.log(`  ✓ ${relPath}`);
      restored++;
    }
  }

  // Clean up backup directory
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  console.log(`[Obfuscate] Restored ${restored} files, backup cleaned up`);
}

// CLI entry
const action = process.argv[2];
if (action === 'restore') {
  restore();
} else {
  obfuscate();
}
