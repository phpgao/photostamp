const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectPhotos: () => ipcRenderer.invoke('select-photos'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  getSystemFonts: () => ipcRenderer.invoke('get-system-fonts'),
  readExif: (filePath) => ipcRenderer.invoke('read-exif', filePath),
  reverseGeocode: (params) => ipcRenderer.invoke('reverse-geocode', params),
  generatePreview: (params) => ipcRenderer.invoke('generate-preview', params),
  processPhotos: (params) => ipcRenderer.invoke('process-photos', params),
  openOutputDir: (dirPath) => ipcRenderer.invoke('open-output-dir', dirPath),
  checkExistingFiles: (params) => ipcRenderer.invoke('check-existing-files', params),
  confirmOverwrite: (params) => ipcRenderer.invoke('confirm-overwrite', params),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  testApiKey: (params) => ipcRenderer.invoke('test-api-key', params),
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
  setNativeTheme: (theme) => ipcRenderer.invoke('set-native-theme', theme),
  onThemeChanged: (callback) => {
    ipcRenderer.on('native-theme-changed', (_event, data) => callback(data));
  },
  removeThemeListener: () => {
    ipcRenderer.removeAllListeners('native-theme-changed');
  },
  onProgress: (callback) => {
    ipcRenderer.on('process-progress', (_event, data) => callback(data));
  },
  removeProgressListener: () => {
    ipcRenderer.removeAllListeners('process-progress');
  },
  setLogLevel: (level) => ipcRenderer.invoke('set-log-level', level),
  getLogLevel: () => ipcRenderer.invoke('get-log-level'),
  validateDroppedFiles: (filePaths) => ipcRenderer.invoke('validate-dropped-files', filePaths),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  showNotification: (params) => ipcRenderer.invoke('show-notification', params),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
