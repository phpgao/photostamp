// Init fontconfig BEFORE anything that might load sharp
require('./lib/fontconfig');

const { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell, Notification, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('./lib/logger');
const { processPhotos, generatePreview, getOutputPath } = require('./lib/watermark');
const { reverseGeocode } = require('./lib/geocoder');
const { readExif } = require('./lib/exif');
const { getSystemFonts } = require('./lib/fonts');

let mainWindow;

// ---- Security: Path validation ----
const SUPPORTED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.tiff', '.webp']);

function isValidImagePath(filePath) {
  if (typeof filePath !== 'string') return false;
  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).toLowerCase();
  return SUPPORTED_IMAGE_EXTS.has(ext);
}

function isValidDirectory(dirPath) {
  if (typeof dirPath !== 'string') return false;
  try {
    const resolved = path.resolve(dirPath);
    const stat = fs.statSync(resolved);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function ensureString(val) {
  if (typeof val !== 'string') return '';
  return val;
}

/** Run fn(mainWindow) only when mainWindow is alive */
function withWindow(fn) {
  if (mainWindow && !mainWindow.isDestroyed()) fn(mainWindow);
}

// ---- Config persistence with API Key encryption ----
const CONFIG_FILE = path.join(app.getPath('userData'), 'settings.json');

const SENSITIVE_KEY_FIELDS = ['amap', 'tencent', 'tianditu', 'mapbox', 'maptiler', 'google', 'qweather'];
const ENCRYPTED_PREFIX = 'enc:';

// In-memory cache of decrypted API keys (never sent to renderer)
let cachedApiKeys = {};

function encryptValue(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return plaintext;
  if (!safeStorage.isEncryptionAvailable()) return plaintext;
  try {
    return ENCRYPTED_PREFIX + safeStorage.encryptString(plaintext).toString('base64');
  } catch (err) {
    log.warn('Config', `Encryption failed, storing as plaintext: ${err.message}`);
    return plaintext;
  }
}

function decryptValue(value) {
  if (!value || typeof value !== 'string') return value;
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('Config', 'Decryption unavailable, returning empty string');
    return '';
  }
  try {
    const buf = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
    return safeStorage.decryptString(buf);
  } catch (err) {
    log.warn('Config', `Decryption failed: ${err.message}`);
    return '';
  }
}

function encryptApiKeys(apiKeys) {
  if (!apiKeys || typeof apiKeys !== 'object') return apiKeys;
  const encrypted = {};
  for (const [key, value] of Object.entries(apiKeys)) {
    encrypted[key] = SENSITIVE_KEY_FIELDS.includes(key) ? encryptValue(value) : value;
  }
  return encrypted;
}

function decryptApiKeys(apiKeys) {
  if (!apiKeys || typeof apiKeys !== 'object') return apiKeys;
  const decrypted = {};
  for (const [key, value] of Object.entries(apiKeys)) {
    decrypted[key] = SENSITIVE_KEY_FIELDS.includes(key) ? decryptValue(value) : value;
  }
  return decrypted;
}

function maskValue(val) {
  if (!val || typeof val !== 'string') return '';
  if (val.length <= 8) return '••••••••';
  return val.slice(0, 4) + '••••' + val.slice(-4);
}

function maskApiKeys(apiKeys) {
  if (!apiKeys || typeof apiKeys !== 'object') return {};
  const masked = {};
  for (const [key, value] of Object.entries(apiKeys)) {
    masked[key] = SENSITIVE_KEY_FIELDS.includes(key) ? maskValue(value) : value;
  }
  return masked;
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (config.apiKeys) {
        cachedApiKeys = decryptApiKeys(config.apiKeys);
      }
      return config;
    }
  } catch {}
  return {};
}

function saveConfig(data) {
  // Merge with existing config so partial saves don't lose other fields
  let existing = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      existing = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  const toSave = { ...existing, ...data };
  if (toSave.apiKeys) {
    // Update in-memory cache with plaintext keys
    cachedApiKeys = { ...toSave.apiKeys };
    // Encrypt before writing to disk
    toSave.apiKeys = encryptApiKeys(toSave.apiKeys);
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
}

function loadConfigForRenderer() {
  const config = loadConfig();
  // Replace API keys with masked values for renderer
  if (config.apiKeys) {
    config.apiKeys = maskApiKeys(cachedApiKeys);
  }
  return config;
}

// ---- Window ----
function createWindow() {
  log.info('App', `Starting PhotoStamp, log level: ${log.getLevel()}`);
  const config = loadConfig();
  const theme = config.theme || 'auto';

  // Sync nativeTheme.themeSource at startup so native UI matches
  if (theme === 'auto') {
    nativeTheme.themeSource = 'system';
  } else {
    nativeTheme.themeSource = theme; // 'dark' or 'light'
  }

  const isDark = nativeTheme.shouldUseDarkColors;

  const windowOpts = {
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: isDark ? '#1a1a2e' : '#f5f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  // macOS-specific title bar styling
  if (process.platform === 'darwin') {
    windowOpts.titleBarStyle = 'hiddenInset';
    windowOpts.trafficLightPosition = { x: 16, y: 16 };
  }

  mainWindow = new BrowserWindow(windowOpts);

  mainWindow.loadFile('renderer/index.html');

  // Production: disable DevTools entirely
  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
    // Disable reload and DevTools shortcuts
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      const isDevToolsShortcut =
        // Cmd+Option+I (macOS) / Ctrl+Shift+I (Win/Linux)
        (input.key === 'I' && input.shift && (input.meta || input.control)) ||
        (input.key === 'i' && input.shift && (input.meta || input.control)) ||
        // F12
        input.key === 'F12' ||
        // Cmd+Option+J (macOS) / Ctrl+Shift+J (Win/Linux) — console
        (input.key === 'J' && input.shift && (input.meta || input.control)) ||
        (input.key === 'j' && input.shift && (input.meta || input.control)) ||
        // Cmd+Option+U (macOS) / Ctrl+U (Win/Linux) — view source
        (input.key === 'U' && input.shift && (input.meta || input.control)) ||
        (input.key === 'u' && (input.meta || input.control));
      if (isDevToolsShortcut) {
        _event.preventDefault();
      }
    });
  }

  // Security: prevent navigation away from the app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') {
      event.preventDefault();
    }
  });

  // Security: deny new window creation, open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---- IPC Handlers ----

ipcMain.handle('select-photos', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'heic', 'tiff', 'webp'] }],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle('select-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('get-system-fonts', async () => {
  return getSystemFonts();
});

ipcMain.handle('read-exif', async (_event, filePath) => {
  if (!isValidImagePath(filePath)) throw new Error('Invalid file path');
  return readExif(filePath);
});

ipcMain.handle('reverse-geocode', async (_event, params) => {
  // Inject real API keys from main process cache
  params.apiKeys = { ...cachedApiKeys };
  return reverseGeocode(params);
});

ipcMain.handle('generate-preview', async (_event, { filePath, options }) => {
  if (!isValidImagePath(filePath)) throw new Error('Invalid file path');
  // Inject real API keys from main process cache
  options.apiKeys = { ...cachedApiKeys };
  return generatePreview(filePath, options);
});

// Check which files already exist in outputDir
ipcMain.handle('check-existing-files', async (_event, { filePaths, outputDir, outputFormat }) => {
  if (!isValidDirectory(outputDir)) return [];
  const existing = [];
  for (const fp of filePaths) {
    const outputPath = getOutputPath(fp, outputDir, outputFormat);
    if (fs.existsSync(outputPath)) {
      existing.push(path.basename(outputPath));
    }
  }
  return existing;
});

// Show overwrite confirmation dialog
ipcMain.handle('confirm-overwrite', async (_event, { fileCount, fileNames }) => {
  const detail = fileNames.length <= 10
    ? fileNames.join('\n')
    : fileNames.slice(0, 10).join('\n') + `\n... and ${fileNames.length - 10} more`;

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Overwrite', 'Skip Existing', 'Cancel'],
    defaultId: 2,
    cancelId: 2,
    title: 'Files Already Exist',
    message: `${fileCount} output file(s) already exist in the target directory.`,
    detail,
  });
  // 0 = overwrite, 1 = skip, 2 = cancel
  return result.response;
});

ipcMain.handle('process-photos', async (event, { filePaths, outputDir, options, skipExisting }) => {
  if (!isValidDirectory(outputDir)) throw new Error('Invalid output directory');
  for (const fp of filePaths) {
    if (!isValidImagePath(fp)) throw new Error(`Invalid file path: ${path.basename(fp)}`);
  }
  // Inject real API keys from main process cache
  options.apiKeys = { ...cachedApiKeys };

  const total = filePaths.length;
  let processed = 0;
  const results = [];

  // Show indeterminate progress at start
  withWindow((w) => w.setProgressBar(0));

  for (const fp of filePaths) {
    // Skip existing check
    if (skipExisting) {
      const outputPath = getOutputPath(fp, outputDir, options.outputFormat || 'jpeg');
      if (fs.existsSync(outputPath)) {
        results.push({ file: fp, success: true, outputPath, skipped: true });
        processed++;
        event.sender.send('process-progress', { processed, total, file: path.basename(fp) });
        withWindow((w) => w.setProgressBar(processed / total));
        continue;
      }
    }

    try {
      const outputPath = await processPhotos(fp, outputDir, options);
      results.push({ file: fp, success: true, outputPath });
    } catch (err) {
      results.push({ file: fp, success: false, error: err.message });
    }
    processed++;
    event.sender.send('process-progress', { processed, total, file: path.basename(fp) });
    withWindow((w) => w.setProgressBar(processed / total));
  }

  // Clear progress bar when done
  withWindow((w) => w.setProgressBar(-1));

  return results;
});

// ---- API Key Testing ----
ipcMain.handle('test-api-key', async (_event, { provider, apiKey }) => {
  // Use provided key (new input from user), or fall back to cached key
  const effectiveKey = (apiKey && apiKey.trim()) ? apiKey.trim() : cachedApiKeys[provider];
  if (!effectiveKey) return { success: false, error: 'No API key provided' };

  // Use a well-known location (Beijing Tiananmen for CN providers, NYC for international)
  const testCoords = {
    amap: { lat: 39.9042, lng: 116.4074 },
    tencent: { lat: 39.9042, lng: 116.4074 },
    tianditu: { lat: 39.9042, lng: 116.4074 },
    qweather: { lat: 39.9042, lng: 116.4074 },
    google: { lat: 40.7128, lng: -74.0060 },
    mapbox: { lat: 40.7128, lng: -74.0060 },
    maptiler: { lat: 40.7128, lng: -74.0060 },
  };
  const coords = testCoords[provider] || { lat: 39.9042, lng: 116.4074 };
  try {
    const result = await reverseGeocode({
      lat: coords.lat,
      lng: coords.lng,
      provider,
      level: 'city',
      apiKeys: { [provider]: effectiveKey },
      hideProvince: false,
    });
    // If we got empty string back, it likely failed silently
    if (!result) {
      return { success: false, error: 'No API key or invalid response' };
    }
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ---- System theme ----
ipcMain.handle('get-system-theme', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

// Sync nativeTheme.themeSource so native UI (dialogs, context menus) follows app theme
ipcMain.handle('set-native-theme', (_event, theme) => {
  // Only allow known values
  const allowed = ['dark', 'light', 'system'];
  if (!allowed.includes(theme)) return;
  nativeTheme.themeSource = theme;
  // Update window background to avoid flash on theme change
  withWindow((w) => {
    const isDark = nativeTheme.shouldUseDarkColors;
    w.setBackgroundColor(isDark ? '#1a1a2e' : '#f5f5f7');
  });
});

nativeTheme.on('updated', () => {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  withWindow((w) => {
    w.webContents.send('native-theme-changed', theme);
    w.setBackgroundColor(theme === 'dark' ? '#1a1a2e' : '#f5f5f7');
  });
});

// ---- Open output directory ----
ipcMain.handle('open-output-dir', async (_event, dirPath) => {
  if (!isValidDirectory(dirPath)) throw new Error('Invalid directory path');
  shell.openPath(path.resolve(dirPath));
});

// ---- Settings persistence ----
ipcMain.handle('load-settings', async () => {
  return loadConfigForRenderer();
});

ipcMain.handle('save-settings', async (_event, settings) => {
  // Renderer sends apiKeys where:
  // - new/changed values are plaintext (user typed them)
  // - unchanged values are empty string (placeholder only in UI)
  // Merge with cached real keys
  if (settings.apiKeys) {
    const merged = { ...cachedApiKeys };
    for (const [key, value] of Object.entries(settings.apiKeys)) {
      if (SENSITIVE_KEY_FIELDS.includes(key)) {
        if (value && value !== '') {
          // New value from user input
          merged[key] = value;
        }
        // Empty string means keep existing (or remove if not cached)
      } else {
        merged[key] = value;
      }
    }
    // Remove keys explicitly cleared by renderer
    for (const key of SENSITIVE_KEY_FIELDS) {
      if (settings.apiKeys[key] === null) {
        delete merged[key];
      }
    }
    settings.apiKeys = merged;
  }
  saveConfig(settings);
  return true;
});

// ---- Log level control ----
const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

ipcMain.handle('set-log-level', async (_event, level) => {
  if (!VALID_LOG_LEVELS.has(level)) throw new Error('Invalid log level');
  log.setLevel(level);
  log.info('App', `Log level changed to: ${log.getLevel()}`);
  return log.getLevel();
});

ipcMain.handle('get-log-level', async () => {
  return log.getLevel();
});

// ---- Validate dropped files ----
ipcMain.handle('validate-dropped-files', async (_event, filePaths) => {
  const valid = [];
  for (const fp of filePaths) {
    try {
      const ext = path.extname(fp).toLowerCase();
      if (!SUPPORTED_IMAGE_EXTS.has(ext)) continue;
      const stat = fs.statSync(fp);
      if (stat.isFile()) {
        valid.push(fp);
      }
    } catch {}
  }
  return valid;
});

// ---- Notification ----
ipcMain.handle('show-notification', async (_event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: ensureString(title).slice(0, 100),
      body: ensureString(body).slice(0, 500),
    }).show();
  }
});

// ---- Open external URL in system browser ----
ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});
