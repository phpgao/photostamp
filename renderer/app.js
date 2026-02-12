// ============================================
// Photo Watermark - Renderer Logic
// ============================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---- Provider definitions ----
const ALL_PROVIDERS = [
  // Global
  { id: 'google', nameZh: 'Google Maps', nameEn: 'Google Maps', i18nKey: 'mapGoogle', settingInput: 'settingGoogleKey', keyField: 'google' },
  { id: 'mapbox', nameZh: 'Mapbox', nameEn: 'Mapbox', i18nKey: 'mapMapbox', settingInput: 'settingMapboxToken', keyField: 'mapbox' },
  { id: 'maptiler', nameZh: 'MapTiler', nameEn: 'MapTiler', i18nKey: 'mapMaptiler', settingInput: 'settingMaptilerKey', keyField: 'maptiler' },
  // CN
  { id: 'amap', nameZh: '高德地图', nameEn: 'Amap (Gaode)', i18nKey: 'mapAmap', settingInput: 'settingAmapKey', keyField: 'amap' },
  { id: 'tencent', nameZh: '腾讯位置服务', nameEn: 'Tencent LBS', i18nKey: 'mapTencent', settingInput: 'settingTencentKey', keyField: 'tencent' },
  { id: 'tianditu', nameZh: '天地图', nameEn: 'Tianditu', i18nKey: 'mapTianditu', settingInput: 'settingTiandituToken', keyField: 'tianditu' },
  { id: 'qweather', nameZh: '和风天气', nameEn: 'QWeather', i18nKey: 'mapQweather', settingInput: 'settingQweatherKey', keyField: 'qweather' },
];

const COUNTRIES = [
  'CN', 'US', 'JP', 'KR', 'GB', 'DE', 'FR', 'AU', 'CA', 'RU', 'IN', 'BR', 'TH', 'SG', 'MY', 'VN',
];

// ---- State ----
const state = {
  photos: [],
  selectedIndex: 0,
  fontFamily: '',
  lang: 'zh',
  theme: 'auto',
  zoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  // Settings (persisted)
  settings: {
    apiKeys: {},
    homeCountries: [],
    domesticProvider: '',
    foreignProvider: '',
  },
  // Pending overwrite resolution
  pendingProcess: null,
};

// ---- i18n ----
function t(key) {
  const dict = LANG[state.lang] || LANG.zh;
  return dict[key] || key;
}

function applyI18n() {
  $$('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (typeof val === 'string') el.textContent = val;
  });
  $$('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    const val = t(key);
    if (typeof val === 'string') el.placeholder = val;
  });
  $$('[data-i18n-text]').forEach((el) => {
    const key = el.dataset.i18nText;
    const val = t(key);
    if (typeof val === 'string') el.textContent = val;
  });
  if (state.photos.length > 0) {
    const fn = LANG[state.lang].photosSelected;
    els.fileCount.textContent = fn(state.photos.length);
  }
  const v = parseInt(els.rangeFontSize.value);
  els.fontSizeVal.textContent = v === 0 ? t('fontSizeAuto') : `${v}px`;

  const sv = parseInt(els.rangeStrokeWidth.value);
  els.strokeWidthVal.textContent = sv === 0 ? t('strokeWidthNone') : `${sv}px`;

  // Update dynamic provider dropdowns
  updateProviderDropdowns();
  renderCountryChips();
  updateSettingsProviderSelects();
  updateTokenStatuses();
}

// ---- Mask utility ----
// maskToken is kept for potential display use but masking is done by main process

// ---- Element References ----
const els = {
  // Main page
  btnSelectPhotos: $('#btnSelectPhotos'),
  fileCount: $('#fileCount'),
  chkDateTime: $('#chkDateTime'),
  dateTimeOptions: $('#dateTimeOptions'),
  selDateFormat: $('#selDateFormat'),
  txtCustomDateFmt: $('#txtCustomDateFmt'),
  chkLocation: $('#chkLocation'),
  locationOptions: $('#locationOptions'),
  selLocationMode: $('#selLocationMode'),
  addressOptions: $('#addressOptions'),
  customLocationOptions: $('#customLocationOptions'),
  txtCustomLocation: $('#txtCustomLocation'),
  selLocationLevel: $('#selLocationLevel'),
  selGeoProvider: $('#selGeoProvider'),
  providerHint: $('#providerHint'),
  chkHideProvince: $('#chkHideProvince'),
  txtLocationPrefix: $('#txtLocationPrefix'),
  chkChildAge: $('#chkChildAge'),
  childAgeOptions: $('#childAgeOptions'),
  txtBirthday: $('#txtBirthday'),
  selAgeFormat: $('#selAgeFormat'),
  txtAgePrefix: $('#txtAgePrefix'),
  txtCustomText: $('#txtCustomText'),
  selFontFamily: $('#selFontFamily'),
  btnBold: $('#btnBold'),
  btnItalic: $('#btnItalic'),
  colorPicker: $('#colorPicker'),
  txtColor: $('#txtColor'),
  rangeOpacity: $('#rangeOpacity'),
  opacityVal: $('#opacityVal'),
  rangeFontSize: $('#rangeFontSize'),
  fontSizeVal: $('#fontSizeVal'),
  rangeStrokeWidth: $('#rangeStrokeWidth'),
  strokeWidthVal: $('#strokeWidthVal'),
  strokeColorRow: $('#strokeColorRow'),
  strokeColorPicker: $('#strokeColorPicker'),
  txtStrokeColor: $('#txtStrokeColor'),
  selShadowEffect: $('#selShadowEffect'),
  selOutputFormat: $('#selOutputFormat'),
  rangeQuality: $('#rangeQuality'),
  qualityVal: $('#qualityVal'),
  previewPanel: $('#previewPanel'),
  previewPlaceholder: $('#previewPlaceholder'),
  previewContainer: $('#previewContainer'),
  previewImage: $('#previewImage'),
  zoomBar: $('#zoomBar'),
  zoomLevel: $('#zoomLevel'),
  btnZoomIn: $('#btnZoomIn'),
  btnZoomOut: $('#btnZoomOut'),
  btnZoomReset: $('#btnZoomReset'),
  thumbnailStrip: $('#thumbnailStrip'),
  btnPreview: $('#btnPreview'),
  chkOpenFolder: $('#chkOpenFolder'),
  btnProcess: $('#btnProcess'),
  progressOverlay: $('#progressOverlay'),
  progressBar: $('#progressBar'),
  progressText: $('#progressText'),
  progressFile: $('#progressFile'),
  resultOverlay: $('#resultOverlay'),
  resultIcon: $('#resultIcon'),
  resultTitle: $('#resultTitle'),
  resultText: $('#resultText'),
  btnCloseResult: $('#btnCloseResult'),
  // Overwrite
  overwriteOverlay: $('#overwriteOverlay'),
  overwriteTitle: $('#overwriteTitle'),
  overwriteText: $('#overwriteText'),
  overwriteFileList: $('#overwriteFileList'),
  btnOverwrite: $('#btnOverwrite'),
  btnSkipExisting: $('#btnSkipExisting'),
  btnCancelProcess: $('#btnCancelProcess'),
  // Pages
  mainPage: $('#mainPage'),
  settingsPage: $('#settingsPage'),
  btnOpenSettings: $('#btnOpenSettings'),
  btnBackToMain: $('#btnBackToMain'),
  // Settings
  settingAmapKey: $('#settingAmapKey'),
  settingTencentKey: $('#settingTencentKey'),
  settingTiandituToken: $('#settingTiandituToken'),
  settingMapboxToken: $('#settingMapboxToken'),
  settingMaptilerKey: $('#settingMaptilerKey'),
  settingGoogleKey: $('#settingGoogleKey'),
  settingQweatherKey: $('#settingQweatherKey'),
  settingDomesticProvider: $('#settingDomesticProvider'),
  settingForeignProvider: $('#settingForeignProvider'),
  countryChips: $('#countryChips'),
  btnSaveSettings: $('#btnSaveSettings'),
  saveFeedback: $('#saveFeedback'),
  statusAmap: $('#statusAmap'),
  statusTencent: $('#statusTencent'),
  statusTianditu: $('#statusTianditu'),
  statusMapbox: $('#statusMapbox'),
  statusMaptiler: $('#statusMaptiler'),
  statusGoogle: $('#statusGoogle'),
  statusQweather: $('#statusQweather'),
  // Theme
  btnThemeToggle: $('#btnThemeToggle'),
  themeIconSun: $('#themeIconSun'),
  themeIconMoon: $('#themeIconMoon'),
  themeIconAuto: $('#themeIconAuto'),
};

// ---- Settings ----

async function loadSettings() {
  // Get system theme first
  try {
    systemTheme = await window.api.getSystemTheme();
  } catch {}

  const saved = await window.api.loadSettings();
  if (saved && typeof saved === 'object') {
    state.settings = {
      apiKeys: saved.apiKeys || {},
      homeCountries: saved.homeCountries || [],
      domesticProvider: saved.domesticProvider || '',
      foreignProvider: saved.foreignProvider || '',
    };
    if (saved.theme) {
      state.theme = saved.theme;
    }
    // Restore watermark config before fonts load
    if (saved.watermarkConfig) {
      state._savedWatermarkConfig = saved.watermarkConfig;
      restoreWatermarkConfig(saved.watermarkConfig);
    }
  }
  applyTheme(state.theme);
  populateSettingsForm();
  updateProviderDropdowns();
  // Restore geoProvider after provider dropdown is populated
  if (state._savedWatermarkConfig?.geoProvider) {
    els.selGeoProvider.value = state._savedWatermarkConfig.geoProvider;
    delete state._savedWatermarkConfig;
  }
  // Load system fonts into dropdown
  try {
    const fonts = await window.api.getSystemFonts();
    const sel = els.selFontFamily;
    for (const f of fonts) {
      const opt = document.createElement('option');
      opt.value = f.family;
      opt.textContent = f.displayName;
      opt.style.fontFamily = `"${f.family}", sans-serif`;
      sel.appendChild(opt);
    }
    // Restore saved font family after font list is populated
    if (state._pendingFontFamily !== undefined) {
      els.selFontFamily.value = state._pendingFontFamily;
      delete state._pendingFontFamily;
    }
  } catch (e) {
    console.warn('Failed to load system fonts:', e);
  }
}

function populateSettingsForm() {
  const keys = state.settings.apiKeys;
  // Show masked values as placeholders; inputs stay empty unless user types new value
  setTokenPlaceholder(els.settingAmapKey, keys.amap);
  setTokenPlaceholder(els.settingTencentKey, keys.tencent);
  setTokenPlaceholder(els.settingTiandituToken, keys.tianditu);
  setTokenPlaceholder(els.settingMapboxToken, keys.mapbox);
  setTokenPlaceholder(els.settingMaptilerKey, keys.maptiler);
  setTokenPlaceholder(els.settingGoogleKey, keys.google);
  setTokenPlaceholder(els.settingQweatherKey, keys.qweather);

  updateTokenStatuses();
  renderCountryChips();
  updateSettingsProviderSelects();
}

function setTokenPlaceholder(input, maskedValue) {
  if (!input) return;
  input.value = '';
  input.dataset.hasKey = maskedValue ? 'true' : 'false';
  if (maskedValue) {
    input.placeholder = maskedValue;
  }
}

function updateTokenStatuses() {
  const statusMap = {
    statusAmap: 'amap',
    statusTencent: 'tencent',
    statusTianditu: 'tianditu',
    statusMapbox: 'mapbox',
    statusMaptiler: 'maptiler',
    statusGoogle: 'google',
    statusQweather: 'qweather',
  };
  for (const [elId, keyField] of Object.entries(statusMap)) {
    const el = els[elId];
    if (!el) continue;
    const hasToken = !!state.settings.apiKeys[keyField];
    el.textContent = hasToken ? t('tokenConfigured') : t('tokenNotConfigured');
    el.className = 'token-status ' + (hasToken ? 'configured' : 'not-configured');
  }
}

// Token input clear tracking: detect when user explicitly clears a field
function initTokenInputs() {
  const tokenInputs = [els.settingAmapKey, els.settingTencentKey, els.settingTiandituToken, els.settingMapboxToken, els.settingMaptilerKey, els.settingGoogleKey, els.settingQweatherKey];
  tokenInputs.forEach((input) => {
    if (!input) return;
    // When user focuses a field that has a saved key, show hint
    input.addEventListener('focus', () => {
      if (input.dataset.hasKey === 'true' && !input.value) {
        // Keep placeholder visible; user can type to replace
      }
    });
  });
}

// Country chips
function renderCountryChips() {
  const container = els.countryChips;
  if (!container) return;
  container.innerHTML = '';
  for (const code of COUNTRIES) {
    const chip = document.createElement('span');
    chip.className = 'country-chip' + (state.settings.homeCountries.includes(code) ? ' selected' : '');
    chip.textContent = t(`country_${code}`);
    chip.dataset.code = code;
    chip.addEventListener('click', () => {
      const idx = state.settings.homeCountries.indexOf(code);
      if (idx >= 0) {
        state.settings.homeCountries.splice(idx, 1);
      } else {
        state.settings.homeCountries.push(code);
      }
      chip.classList.toggle('selected');
    });
    container.appendChild(chip);
  }
}

// Settings provider selects (domestic/foreign) - only show configured providers
function updateSettingsProviderSelects() {
  const configured = getConfiguredProviders();

  [els.settingDomesticProvider, els.settingForeignProvider].forEach((sel, idx) => {
    if (!sel) return;
    const currentVal = idx === 0 ? state.settings.domesticProvider : state.settings.foreignProvider;
    const placeholderKey = idx === 0 ? 'domesticProviderPlaceholder' : 'foreignProviderPlaceholder';
    sel.innerHTML = `<option value="">${t(placeholderKey)}</option>`;

    for (const p of configured) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = state.lang === 'en' ? p.nameEn : p.nameZh;
      if (p.id === currentVal) opt.selected = true;
      sel.appendChild(opt);
    }
  });
}

function getConfiguredProviders() {
  return ALL_PROVIDERS.filter((p) => {
    const key = state.settings.apiKeys[p.keyField];
    return key && key.trim().length > 0;
  });
}

// Save settings
async function saveSettings() {
  // Collect token values: new input = plaintext, empty = keep existing, null = clear
  const tokenMap = {
    amap: els.settingAmapKey,
    tencent: els.settingTencentKey,
    tianditu: els.settingTiandituToken,
    mapbox: els.settingMapboxToken,
    maptiler: els.settingMaptilerKey,
    google: els.settingGoogleKey,
    qweather: els.settingQweatherKey,
  };

  const apiKeys = {};
  for (const [key, input] of Object.entries(tokenMap)) {
    const typed = input ? input.value.trim() : '';
    if (typed) {
      apiKeys[key] = typed; // New value from user
    } else {
      apiKeys[key] = ''; // Keep existing (main process handles merge)
    }
  }
  state.settings.apiKeys = apiKeys;

  state.settings.domesticProvider = els.settingDomesticProvider?.value || '';
  state.settings.foreignProvider = els.settingForeignProvider?.value || '';

  await window.api.saveSettings(buildFullSettings({ includeApiKeys: true }));

  // Reload settings from main process to get updated masked values
  const saved = await window.api.loadSettings();
  if (saved && typeof saved === 'object') {
    state.settings.apiKeys = saved.apiKeys || {};
  }

  // Re-populate with masked values
  populateSettingsForm();

  // Show saved feedback
  els.saveFeedback?.classList.remove('hidden');
  setTimeout(() => els.saveFeedback?.classList.add('hidden'), 2000);

  // Update main page provider dropdown
  updateProviderDropdowns();
}

// ---- Main page: provider dropdown (only configured tokens) ----
function updateProviderDropdowns() {
  const sel = els.selGeoProvider;
  if (!sel) return;

  const currentVal = sel.value;
  sel.innerHTML = '';

  // Always show "Auto"
  const autoOpt = document.createElement('option');
  autoOpt.value = 'auto';
  autoOpt.textContent = t('mapAuto');
  autoOpt.setAttribute('data-i18n-text', 'mapAuto');
  sel.appendChild(autoOpt);

  const configured = getConfiguredProviders();
  for (const p of configured) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = t(p.i18nKey);
    opt.setAttribute('data-i18n-text', p.i18nKey);
    sel.appendChild(opt);
  }

  // Restore selection if still valid
  if ([...sel.options].some((o) => o.value === currentVal)) {
    sel.value = currentVal;
  } else {
    sel.value = 'auto';
  }

  // Show hint when no providers configured
  if (els.providerHint) {
    if (configured.length === 0) {
      els.providerHint.textContent = t('noProviderAvailable');
      els.providerHint.className = 'hint-text hint-warn';
    } else {
      els.providerHint.textContent = '';
      els.providerHint.className = 'hint-text';
    }
  }
}

// ---- Watermark Config Persistence ----

function collectWatermarkConfig() {
  return {
    showDateTime: els.chkDateTime.checked,
    dateFormat: els.selDateFormat.value,
    customDateFmt: els.txtCustomDateFmt.value,
    showLocation: els.chkLocation.checked,
    locationMode: els.selLocationMode.value,
    locationLevel: els.selLocationLevel.value,
    geoProvider: els.selGeoProvider.value,
    hideProvince: els.chkHideProvince.checked,
    customLocation: els.txtCustomLocation.value,
    locationPrefix: els.txtLocationPrefix.value,
    showChildAge: els.chkChildAge.checked,
    childBirthday: els.txtBirthday.value,
    childAgeFormat: els.selAgeFormat.value,
    childAgePrefix: els.txtAgePrefix.value,
    customText: els.txtCustomText.value,
    fontFamily: els.selFontFamily.value,
    fontBold: els.btnBold.classList.contains('active'),
    fontItalic: els.btnItalic.classList.contains('active'),
    watermarkColor: els.colorPicker.value,
    opacity: els.rangeOpacity.value,
    fontSize: els.rangeFontSize.value,
    strokeWidth: els.rangeStrokeWidth.value,
    strokeColor: els.strokeColorPicker.value,
    shadowEffect: els.selShadowEffect.value,
    position: document.querySelector('.pos-btn.active')?.dataset.pos || 'bottom-left',
    textAlign: document.querySelector('.align-btn.active')?.dataset.align || 'left',
    outputFormat: els.selOutputFormat.value,
    outputQuality: els.rangeQuality.value,
    openFolderAfter: els.chkOpenFolder.checked,
  };
}

function saveWatermarkConfig() {
  window.api.saveSettings(buildFullSettings());
}

function buildFullSettings({ includeApiKeys = false } = {}) {
  const { apiKeys, ...rest } = state.settings;
  const result = { ...rest, theme: state.theme, watermarkConfig: collectWatermarkConfig() };
  if (includeApiKeys) {
    result.apiKeys = apiKeys;
  }
  return result;
}

let _saveConfigDebounce = null;
function scheduleSaveConfig() {
  if (_saveConfigDebounce) clearTimeout(_saveConfigDebounce);
  _saveConfigDebounce = setTimeout(saveWatermarkConfig, 300);
}

function restoreWatermarkConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;

  // Checkboxes & toggles
  if (cfg.showDateTime !== undefined) {
    els.chkDateTime.checked = cfg.showDateTime;
    els.dateTimeOptions.classList.toggle('hidden', !cfg.showDateTime);
  }
  if (cfg.showLocation !== undefined) {
    els.chkLocation.checked = cfg.showLocation;
    els.locationOptions.classList.toggle('hidden', !cfg.showLocation);
  }
  if (cfg.showChildAge !== undefined) {
    els.chkChildAge.checked = cfg.showChildAge;
    els.childAgeOptions.classList.toggle('hidden', !cfg.showChildAge);
  }

  // Date format
  if (cfg.dateFormat) {
    els.selDateFormat.value = cfg.dateFormat;
    els.txtCustomDateFmt.classList.toggle('hidden', cfg.dateFormat !== 'custom');
  }
  if (cfg.customDateFmt) els.txtCustomDateFmt.value = cfg.customDateFmt;

  // Location
  if (cfg.locationMode) {
    els.selLocationMode.value = cfg.locationMode;
    els.addressOptions.classList.toggle('hidden', cfg.locationMode !== 'address');
    els.customLocationOptions.classList.toggle('hidden', cfg.locationMode !== 'custom');
  }
  if (cfg.locationLevel) els.selLocationLevel.value = cfg.locationLevel;
  if (cfg.geoProvider) els.selGeoProvider.value = cfg.geoProvider;
  if (cfg.hideProvince !== undefined) els.chkHideProvince.checked = cfg.hideProvince;
  if (cfg.customLocation !== undefined) els.txtCustomLocation.value = cfg.customLocation;
  if (cfg.locationPrefix !== undefined) els.txtLocationPrefix.value = cfg.locationPrefix;

  // Baby Age
  if (cfg.childBirthday) els.txtBirthday.value = cfg.childBirthday;
  if (cfg.childAgeFormat) els.selAgeFormat.value = cfg.childAgeFormat;
  if (cfg.childAgePrefix !== undefined) els.txtAgePrefix.value = cfg.childAgePrefix;

  // Custom text
  if (cfg.customText !== undefined) els.txtCustomText.value = cfg.customText;

  // Font family (may need to wait for font list to load)
  if (cfg.fontFamily !== undefined) state._pendingFontFamily = cfg.fontFamily;

  // Font bold / italic
  if (cfg.fontBold) els.btnBold.classList.add('active');
  else els.btnBold.classList.remove('active');
  if (cfg.fontItalic) els.btnItalic.classList.add('active');
  else els.btnItalic.classList.remove('active');

  // Color
  if (cfg.watermarkColor) {
    els.colorPicker.value = cfg.watermarkColor;
    els.txtColor.value = cfg.watermarkColor;
  }

  // Opacity
  if (cfg.opacity) {
    els.rangeOpacity.value = cfg.opacity;
    els.opacityVal.textContent = `${Math.round(parseFloat(cfg.opacity) * 100)}%`;
  }

  // Font size
  if (cfg.fontSize !== undefined) {
    els.rangeFontSize.value = cfg.fontSize;
    const v = parseInt(cfg.fontSize);
    els.fontSizeVal.textContent = v === 0 ? t('fontSizeAuto') : `${v}px`;
  }

  // Stroke
  if (cfg.strokeWidth !== undefined) {
    els.rangeStrokeWidth.value = cfg.strokeWidth;
    const sv = parseInt(cfg.strokeWidth);
    els.strokeWidthVal.textContent = sv === 0 ? t('strokeWidthNone') : `${sv}px`;
    els.strokeColorRow.classList.toggle('hidden', sv === 0);
  }
  if (cfg.strokeColor) {
    els.strokeColorPicker.value = cfg.strokeColor;
    els.txtStrokeColor.value = cfg.strokeColor;
  }

  // Shadow
  if (cfg.shadowEffect) els.selShadowEffect.value = cfg.shadowEffect;

  // Position
  if (cfg.position) {
    $$('.pos-btn').forEach((b) => b.classList.remove('active'));
    const target = document.querySelector(`.pos-btn[data-pos="${cfg.position}"]`);
    if (target) target.classList.add('active');
  }

  // Text align
  if (cfg.textAlign) {
    $$('.align-btn').forEach((b) => b.classList.remove('active'));
    const target = document.querySelector(`.align-btn[data-align="${cfg.textAlign}"]`);
    if (target) target.classList.add('active');
  }

  // Output
  if (cfg.outputFormat) {
    els.selOutputFormat.value = cfg.outputFormat;
    els.rangeQuality.disabled = cfg.outputFormat === 'png';
  }
  if (cfg.outputQuality) {
    els.rangeQuality.value = cfg.outputQuality;
    els.qualityVal.textContent = `${cfg.outputQuality}%`;
  }

  // Open folder checkbox
  if (cfg.openFolderAfter !== undefined) els.chkOpenFolder.checked = cfg.openFolderAfter;
}

// ---- Helpers ----

function getWatermarkOptions() {
  const dateFormat = els.selDateFormat.value === 'custom'
    ? els.txtCustomDateFmt.value
    : els.selDateFormat.value;

  return {
    showDateTime: els.chkDateTime.checked,
    dateTimeFormat: dateFormat,
    showLocation: els.chkLocation.checked,
    locationMode: els.selLocationMode.value,
    locationLevel: els.selLocationLevel.value,
    geoProvider: els.selGeoProvider.value,
    // apiKeys are injected by main process — never sent from renderer
    hideProvince: els.chkHideProvince.checked,
    customLocation: els.txtCustomLocation.value,
    locationPrefix: els.txtLocationPrefix.value,
    homeCountries: state.settings.homeCountries,
    domesticProvider: state.settings.domesticProvider,
    foreignProvider: state.settings.foreignProvider,
    showChildAge: els.chkChildAge.checked,
    childBirthday: els.txtBirthday.value,
    childAgeFormat: els.selAgeFormat.value,
    childAgePrefix: els.txtAgePrefix.value.trim(),
    lang: state.lang,
    customText: els.txtCustomText.value.trim(),
    fontFamily: els.selFontFamily.value || '',
    fontBold: els.btnBold.classList.contains('active'),
    fontItalic: els.btnItalic.classList.contains('active'),
    watermarkColor: els.colorPicker.value,
    watermarkOpacity: parseFloat(els.rangeOpacity.value),
    fontSize: parseInt(els.rangeFontSize.value) || 0,
    watermarkPosition: document.querySelector('.pos-btn.active')?.dataset.pos || 'bottom-left',
    textAlign: document.querySelector('.align-btn.active')?.dataset.align || 'left',
    strokeWidth: parseInt(els.rangeStrokeWidth.value) || 0,
    strokeColor: els.strokeColorPicker.value,
    shadowEffect: els.selShadowEffect.value || 'medium',
    outputFormat: els.selOutputFormat.value,
    outputQuality: parseInt(els.rangeQuality.value),
  };
}

// ---- Zoom/Pan ----

function resetZoom() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  applyTransform();
}

function applyTransform() {
  const img = els.previewImage;
  if (!img) return;
  const container = els.previewContainer;
  if (!container) return;

  if (state.zoom <= 1) {
    img.style.transform = '';
    img.style.transformOrigin = 'center center';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    container.style.cursor = 'default';
  } else {
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.transformOrigin = '0 0';
    img.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    container.style.cursor = state.isPanning ? 'grabbing' : 'grab';
  }

  els.zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
}

function zoomTo(newZoom, centerX, centerY) {
  const oldZoom = state.zoom;
  newZoom = Math.max(0.25, Math.min(10, newZoom));

  if (newZoom > 1 && oldZoom <= 1) {
    const container = els.previewContainer;
    const img = els.previewImage;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const fitScale = Math.min(cw / iw, ch / ih, 1);
    const fitW = iw * fitScale;
    const fitH = ih * fitScale;
    state.panX = (cw - fitW * newZoom) / 2;
    state.panY = (ch - fitH * newZoom) / 2;
    state.zoom = newZoom;
  } else if (newZoom <= 1) {
    state.zoom = newZoom;
    state.panX = 0;
    state.panY = 0;
  } else {
    if (centerX !== undefined && centerY !== undefined) {
      const ratio = newZoom / oldZoom;
      state.panX = centerX - (centerX - state.panX) * ratio;
      state.panY = centerY - (centerY - state.panY) * ratio;
    }
    state.zoom = newZoom;
  }

  applyTransform();
}

function initZoomPan() {
  const container = els.previewContainer;
  if (!container) return;

  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoomTo(state.zoom * delta, cx, cy);
  }, { passive: false });

  container.addEventListener('mousedown', (e) => {
    if (state.zoom <= 1) return;
    state.isPanning = true;
    state.panStartX = e.clientX - state.panX;
    state.panStartY = e.clientY - state.panY;
    container.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isPanning) return;
    state.panX = e.clientX - state.panStartX;
    state.panY = e.clientY - state.panStartY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (state.isPanning) {
      state.isPanning = false;
      applyTransform();
    }
  });

  container.addEventListener('dblclick', () => {
    if (state.zoom !== 1) {
      resetZoom();
    } else {
      zoomTo(2);
    }
  });

  els.btnZoomIn.addEventListener('click', () => zoomTo(state.zoom * 1.25));
  els.btnZoomOut.addEventListener('click', () => zoomTo(state.zoom / 1.25));
  els.btnZoomReset.addEventListener('click', resetZoom);
}

// ---- Preview ----

let previewDebounce = null;

function showLoading() {
  if (els.previewPlaceholder) els.previewPlaceholder.classList.add('hidden');
  if (els.previewContainer) els.previewContainer.classList.add('hidden');
  const existing = els.previewPanel.querySelector('.preview-loading');
  if (!existing) {
    const loader = document.createElement('div');
    loader.className = 'preview-loading';
    loader.innerHTML = `<div class="spinner"></div><p>${t('previewLoading')}</p>`;
    els.previewPanel.appendChild(loader);
  }
}

function hideLoading() {
  const loader = els.previewPanel.querySelector('.preview-loading');
  if (loader) loader.remove();
}

async function doPreview() {
  if (state.photos.length === 0) return;
  const photo = state.photos[state.selectedIndex];
  if (!photo) return;

  showLoading();

  try {
    const options = getWatermarkOptions();
    const base64 = await window.api.generatePreview({ filePath: photo.path, options });
    hideLoading();
    els.previewImage.src = base64;
    els.previewContainer.classList.remove('hidden');
    if (els.previewPlaceholder) els.previewPlaceholder.classList.add('hidden');
    els.zoomBar.classList.remove('hidden');
    resetZoom();
  } catch (err) {
    hideLoading();
    if (els.previewPlaceholder) {
      const fn = LANG[state.lang].previewFail;
      els.previewPlaceholder.innerHTML = `<p style="color:var(--danger)">${fn(err.message)}</p>`;
      els.previewPlaceholder.classList.remove('hidden');
    }
    els.previewContainer.classList.add('hidden');
    els.zoomBar.classList.add('hidden');
  }
}

function schedulePreview() {
  if (previewDebounce) clearTimeout(previewDebounce);
  previewDebounce = setTimeout(doPreview, 500);
  scheduleSaveConfig();
}

// ---- Page navigation ----

function showSettings() {
  els.mainPage.classList.add('hidden');
  els.settingsPage.classList.remove('hidden');
  // Refresh settings form from saved state
  populateSettingsForm();
}

function showMain() {
  els.settingsPage.classList.add('hidden');
  els.mainPage.classList.remove('hidden');
  updateProviderDropdowns();
}

// ---- Theme ----

// Resolve effective theme from preference ('dark'|'light'|'auto') + optional system theme
let systemTheme = 'light'; // will be updated on init; matches CSS default

function getEffectiveTheme(pref) {
  if (pref === 'auto') return systemTheme;
  return pref;
}

function applyTheme(pref) {
  state.theme = pref;
  const effective = getEffectiveTheme(pref);
  document.documentElement.setAttribute('data-theme', effective);

  // Sync native theme so system dialogs, context menus follow app theme
  window.api.setNativeTheme(pref === 'auto' ? 'system' : pref);

  // Update icons: show only the icon representing current mode
  if (els.themeIconSun && els.themeIconMoon && els.themeIconAuto) {
    els.themeIconSun.classList.add('hidden');
    els.themeIconMoon.classList.add('hidden');
    els.themeIconAuto.classList.add('hidden');
    if (pref === 'auto') {
      els.themeIconAuto.classList.remove('hidden');
    } else if (pref === 'dark') {
      els.themeIconMoon.classList.remove('hidden');
    } else {
      els.themeIconSun.classList.remove('hidden');
    }
  }

  // Update tooltip
  if (els.btnThemeToggle) {
    const labels = { auto: t('darkMode'), dark: t('lightMode'), light: t('autoMode') };
    els.btnThemeToggle.title = labels[pref] || '';
  }
}

function toggleTheme() {
  // Cycle: auto -> dark -> light -> auto
  const cycle = { auto: 'dark', dark: 'light', light: 'auto' };
  const newTheme = cycle[state.theme] || 'auto';
  applyTheme(newTheme);
  window.api.saveSettings(buildFullSettings());
}

// Listen for system theme changes (for auto mode)
window.api.onThemeChanged((sysTheme) => {
  systemTheme = sysTheme;
  if (state.theme === 'auto') {
    document.documentElement.setAttribute('data-theme', sysTheme);
  }
});

// ---- API Token Test ----

function initTokenTest() {
  $$('.btn-test').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const provider = btn.dataset.provider;
      const inputId = btn.dataset.input;
      const input = document.getElementById(inputId);
      if (!input) return;

      // Send new typed value if any; main process falls back to cached key
      const apiKey = input.value.trim();

      const resultEl = document.getElementById(`testResult${provider.charAt(0).toUpperCase() + provider.slice(1)}`);

      // Show loading state
      btn.classList.add('testing');
      btn.textContent = t('testing');
      btn.disabled = true;
      if (resultEl) {
        resultEl.classList.add('hidden');
        resultEl.className = 'token-test-result hidden';
      }

      try {
        const result = await window.api.testApiKey({ provider, apiKey });
        if (result.success) {
          if (resultEl) {
            resultEl.textContent = `${t('testSuccess')} - ${result.result}`;
            resultEl.className = 'token-test-result success';
            resultEl.classList.remove('hidden');
          }
          // If user typed a new key and test passed, auto-save it
          if (apiKey) {
            const saveKeys = {};
            for (const p of ALL_PROVIDERS) {
              const inp = document.getElementById(p.settingInput);
              saveKeys[p.keyField] = (inp && inp.value.trim()) ? inp.value.trim() : '';
            }
            state.settings.apiKeys = saveKeys;
            await window.api.saveSettings(buildFullSettings({ includeApiKeys: true }));
            // Reload settings to get new masked values
            const saved = await window.api.loadSettings();
            if (saved && saved.apiKeys) {
              state.settings.apiKeys = saved.apiKeys;
            }
            populateSettingsForm();
            updateProviderDropdowns();
          }
        } else {
          if (resultEl) {
            const msg = typeof t('testFailed') === 'function'
              ? LANG[state.lang].testFailed(result.error)
              : `${t('testFailed')}: ${result.error}`;
            resultEl.textContent = msg;
            resultEl.className = 'token-test-result error';
            resultEl.classList.remove('hidden');
          }
        }
      } catch (err) {
        if (resultEl) {
          const msg = typeof LANG[state.lang].testFailed === 'function'
            ? LANG[state.lang].testFailed(err.message)
            : err.message;
          resultEl.textContent = msg;
          resultEl.className = 'token-test-result error';
          resultEl.classList.remove('hidden');
        }
      } finally {
        btn.classList.remove('testing');
        btn.textContent = t('testBtn');
        btn.disabled = false;
      }
    });
  });
}

// ---- Quota buttons ----
function initQuotaButtons() {
  $$('.btn-quota').forEach((btn) => {
    btn.addEventListener('click', () => {
      const href = btn.dataset.href;
      if (href) window.api.openExternal(href);
    });
  });
}

// ---- Event Listeners ----

// Settings
els.btnOpenSettings.addEventListener('click', () => {
  if (!els.settingsPage.classList.contains('hidden')) {
    showMain();
  } else {
    showSettings();
  }
});
els.btnBackToMain.addEventListener('click', showMain);
els.btnSaveSettings.addEventListener('click', saveSettings);

// Theme toggle
els.btnThemeToggle.addEventListener('click', toggleTheme);

// Language switch
$$('.lang-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.lang-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.lang = btn.dataset.lang;
    applyI18n();
    schedulePreview();
  });
});

// ---- Load photos (shared by select button & drag-drop) ----

async function loadPhotos(paths, { append = false } = {}) {
  if (paths.length === 0) return;

  if (append && state.photos.length > 0) {
    // Filter out duplicates (paths already in the list)
    const existingPaths = new Set(state.photos.map((p) => p.path));
    const newPaths = paths.filter((p) => !existingPaths.has(p));
    if (newPaths.length === 0) return;

    const startIndex = state.photos.length;
    for (const p of newPaths) {
      state.photos.push({ path: p, exif: null });
    }

    // Append thumbnails for new photos only
    for (let i = startIndex; i < state.photos.length; i++) {
      appendThumbnail(i);
    }

    // Select the first newly added photo
    state.selectedIndex = startIndex;
    $$('.thumb-item').forEach((el) => el.classList.remove('active'));
    const target = els.thumbnailStrip.querySelector(`.thumb-item[data-index="${startIndex}"]`);
    if (target) target.classList.add('active');
  } else {
    // Replace mode
    state.photos = paths.map((p) => ({ path: p, exif: null }));
    state.selectedIndex = 0;

    els.thumbnailStrip.classList.remove('hidden');
    els.thumbnailStrip.innerHTML = '';

    for (let i = 0; i < state.photos.length; i++) {
      appendThumbnail(i, i === 0);
    }
  }

  const fn = LANG[state.lang].photosSelected;
  els.fileCount.textContent = fn(state.photos.length);
  els.btnPreview.disabled = false;
  els.btnProcess.disabled = false;
  els.thumbnailStrip.classList.remove('hidden');

  try {
    const idx = state.selectedIndex;
    if (!state.photos[idx].exif) {
      state.photos[idx].exif = await window.api.readExif(state.photos[idx].path);
    }
  } catch {}
  doPreview();
}

function appendThumbnail(i, active = false) {
  const thumb = document.createElement('div');
  thumb.className = `thumb-item${active ? ' active' : ''}`;
  thumb.dataset.index = i;

  const img = document.createElement('img');
  img.src = state.photos[i].path;
  img.loading = 'lazy';
  thumb.appendChild(img);

  thumb.addEventListener('click', () => {
    $$('.thumb-item').forEach((el) => el.classList.remove('active'));
    thumb.classList.add('active');
    state.selectedIndex = i;
    doPreview();
  });

  els.thumbnailStrip.appendChild(thumb);
}

// Select photos via dialog
els.btnSelectPhotos.addEventListener('click', async () => {
  const paths = await window.api.selectPhotos();
  loadPhotos(paths);
});

// Toggle sections
els.chkDateTime.addEventListener('change', () => {
  els.dateTimeOptions.classList.toggle('hidden', !els.chkDateTime.checked);
  schedulePreview();
});

els.chkLocation.addEventListener('change', () => {
  els.locationOptions.classList.toggle('hidden', !els.chkLocation.checked);
  schedulePreview();
});

els.chkChildAge.addEventListener('change', () => {
  els.childAgeOptions.classList.toggle('hidden', !els.chkChildAge.checked);
  schedulePreview();
});

// Date format
els.selDateFormat.addEventListener('change', () => {
  els.txtCustomDateFmt.classList.toggle('hidden', els.selDateFormat.value !== 'custom');
  schedulePreview();
});
els.txtCustomDateFmt.addEventListener('input', schedulePreview);

// Location
els.selLocationMode.addEventListener('change', () => {
  els.addressOptions.classList.toggle('hidden', els.selLocationMode.value !== 'address');
  els.customLocationOptions.classList.toggle('hidden', els.selLocationMode.value !== 'custom');
  schedulePreview();
});
els.selLocationLevel.addEventListener('change', schedulePreview);
els.selGeoProvider.addEventListener('change', schedulePreview);
els.chkHideProvince.addEventListener('change', schedulePreview);
els.txtLocationPrefix.addEventListener('input', schedulePreview);
els.txtCustomLocation.addEventListener('input', schedulePreview);

// Baby Age
els.txtBirthday.addEventListener('change', schedulePreview);
els.selAgeFormat.addEventListener('change', schedulePreview);
els.txtAgePrefix.addEventListener('input', schedulePreview);
els.txtCustomText.addEventListener('input', schedulePreview);

// Font family selection
els.selFontFamily.addEventListener('change', schedulePreview);

// Font bold / italic toggles
els.btnBold.addEventListener('click', () => {
  els.btnBold.classList.toggle('active');
  schedulePreview();
});
els.btnItalic.addEventListener('click', () => {
  els.btnItalic.classList.toggle('active');
  schedulePreview();
});

// Color
els.colorPicker.addEventListener('input', () => {
  els.txtColor.value = els.colorPicker.value;
  schedulePreview();
});
els.txtColor.addEventListener('input', () => {
  if (/^#[0-9a-fA-F]{6}$/.test(els.txtColor.value)) {
    els.colorPicker.value = els.txtColor.value;
    schedulePreview();
  }
});

// Opacity
els.rangeOpacity.addEventListener('input', () => {
  els.opacityVal.textContent = `${Math.round(els.rangeOpacity.value * 100)}%`;
  schedulePreview();
});

// Font size
els.rangeFontSize.addEventListener('input', () => {
  const v = parseInt(els.rangeFontSize.value);
  els.fontSizeVal.textContent = v === 0 ? t('fontSizeAuto') : `${v}px`;
  schedulePreview();
});

// Stroke width
els.rangeStrokeWidth.addEventListener('input', () => {
  const v = parseInt(els.rangeStrokeWidth.value);
  els.strokeWidthVal.textContent = v === 0 ? t('strokeWidthNone') : `${v}px`;
  els.strokeColorRow.classList.toggle('hidden', v === 0);
  schedulePreview();
});

// Stroke color
els.strokeColorPicker.addEventListener('input', () => {
  els.txtStrokeColor.value = els.strokeColorPicker.value;
  schedulePreview();
});
els.txtStrokeColor.addEventListener('input', () => {
  if (/^#[0-9a-fA-F]{6}$/.test(els.txtStrokeColor.value)) {
    els.strokeColorPicker.value = els.txtStrokeColor.value;
    schedulePreview();
  }
});

// Shadow effect
els.selShadowEffect.addEventListener('change', schedulePreview);

// Quality
els.rangeQuality.addEventListener('input', () => {
  els.qualityVal.textContent = `${els.rangeQuality.value}%`;
  scheduleSaveConfig();
});

// Output format
els.selOutputFormat.addEventListener('change', () => {
  els.rangeQuality.disabled = els.selOutputFormat.value === 'png';
  scheduleSaveConfig();
});

// Position buttons
$$('.pos-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.pos-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    schedulePreview();
  });
});

// Text alignment buttons
$$('.align-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.align-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    schedulePreview();
  });
});

// Preview button
els.btnPreview.addEventListener('click', doPreview);

// ---- Process with overwrite detection ----

els.btnProcess.addEventListener('click', async () => {
  if (state.photos.length === 0) return;

  const outDir = await window.api.selectOutputDir();
  if (!outDir) return;

  const options = getWatermarkOptions();
  const filePaths = state.photos.map((p) => p.path);

  // Check for existing files
  const existing = await window.api.checkExistingFiles({
    filePaths,
    outputDir: outDir,
    outputFormat: options.outputFormat,
  });

  if (existing.length > 0) {
    // Show overwrite dialog
    const lang = LANG[state.lang];
    els.overwriteText.textContent = typeof lang.overwriteMsg === 'function' ? lang.overwriteMsg(existing.length) : `${existing.length} files already exist`;
    els.overwriteFileList.innerHTML = existing.map((f) => `<div>${f}</div>`).join('');
    els.overwriteOverlay.classList.remove('hidden');

    // Store pending process info
    state.pendingProcess = { filePaths, outputDir: outDir, options };
    return;
  }

  // No conflicts, process directly
  runProcess(filePaths, outDir, options, false, els.chkOpenFolder.checked);
});

// Overwrite dialog buttons
function resolveOverwrite(skipExisting) {
  els.overwriteOverlay.classList.add('hidden');
  if (state.pendingProcess) {
    const { filePaths, outputDir, options } = state.pendingProcess;
    state.pendingProcess = null;
    runProcess(filePaths, outputDir, options, skipExisting, els.chkOpenFolder.checked);
  }
}

els.btnOverwrite.addEventListener('click', () => resolveOverwrite(false));
els.btnSkipExisting.addEventListener('click', () => resolveOverwrite(true));

els.btnCancelProcess.addEventListener('click', () => {
  els.overwriteOverlay.classList.add('hidden');
  state.pendingProcess = null;
});

async function runProcess(filePaths, outputDir, options, skipExisting, openFolder) {
  els.progressOverlay.classList.remove('hidden');
  els.progressBar.style.width = '0%';
  els.progressText.textContent = `0 / ${filePaths.length}`;
  els.progressFile.textContent = '';

  window.api.onProgress(({ processed, total, file }) => {
    const pct = Math.round((processed / total) * 100);
    els.progressBar.style.width = `${pct}%`;
    els.progressText.textContent = `${processed} / ${total}`;
    els.progressFile.textContent = file;
  });

  try {
    const results = await window.api.processPhotos({ filePaths, outputDir, options, skipExisting });
    window.api.removeProgressListener();
    els.progressOverlay.classList.add('hidden');

    const successCount = results.filter((r) => r.success && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const failCount = results.filter((r) => !r.success).length;

    els.resultIcon.textContent = failCount === 0 ? '✓' : '⚠';
    els.resultIcon.style.color = failCount === 0 ? 'var(--success)' : 'var(--warning)';
    els.resultTitle.textContent = t('done');

    const lang = LANG[state.lang];
    if (skippedCount > 0) {
      els.resultText.textContent = lang.skippedMsg(successCount, skippedCount, failCount);
    } else if (failCount === 0) {
      els.resultText.textContent = lang.successMsg(successCount);
    } else {
      els.resultText.textContent = lang.partialMsg(successCount, failCount);
    }
    els.resultOverlay.classList.remove('hidden');

    // System notification
    let notifyBody;
    if (skippedCount > 0) {
      notifyBody = lang.notifySkipped(successCount, skippedCount, failCount);
    } else if (failCount === 0) {
      notifyBody = lang.notifySuccess(successCount);
    } else {
      notifyBody = lang.notifyPartial(successCount, failCount);
    }
    window.api.showNotification({ title: lang.notifyTitle, body: notifyBody });

    // Open output folder if requested
    if (openFolder && successCount > 0) {
      window.api.openOutputDir(outputDir);
    }
  } catch (err) {
    window.api.removeProgressListener();
    els.progressOverlay.classList.add('hidden');

    els.resultIcon.textContent = '✕';
    els.resultIcon.style.color = 'var(--danger)';
    els.resultTitle.textContent = t('failed');
    els.resultText.textContent = err.message;
    els.resultOverlay.classList.remove('hidden');

    // System notification for failure
    const lang = LANG[state.lang];
    window.api.showNotification({ title: lang.notifyTitle, body: `${lang.notifyFailed}: ${err.message}` });
  }
}

// Close result
els.btnCloseResult.addEventListener('click', () => {
  els.resultOverlay.classList.add('hidden');
});

// Open folder preference
els.chkOpenFolder.addEventListener('change', scheduleSaveConfig);

// ---- Drag & Drop ----

function initDragAndDrop() {
  let dragCounter = 0;
  let dropOverlay = null;

  function createDropOverlay() {
    if (dropOverlay) return;
    dropOverlay = document.createElement('div');
    dropOverlay.className = 'drop-overlay';
    dropOverlay.innerHTML = `
      <div class="drop-overlay-content">
        <svg class="drop-overlay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="m21 15-5-5L5 21"/>
          <path d="M12 2v6M9 5l3-3 3 3" stroke-width="2"/>
        </svg>
        <span class="drop-overlay-text">${t('dropActive')}</span>
        <span class="drop-overlay-hint">${t('dropHint')}</span>
      </div>
    `;
    document.body.appendChild(dropOverlay);
  }

  function removeDropOverlay() {
    if (dropOverlay) {
      dropOverlay.remove();
      dropOverlay = null;
    }
    els.previewPanel.classList.remove('drag-over');
  }

  function hasImageFiles(dataTransfer) {
    if (dataTransfer.types.includes('Files')) {
      // Check items if available
      if (dataTransfer.items) {
        for (const item of dataTransfer.items) {
          if (item.kind === 'file') {
            const type = item.type;
            if (type.startsWith('image/') || type === '') {
              // type can be empty for .heic etc, so accept empty too
              return true;
            }
          }
        }
      }
      return true; // Fallback: assume files could be images
    }
    return false;
  }

  // Prevent default drag behavior globally
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (dragCounter === 1 && hasImageFiles(e.dataTransfer)) {
      createDropOverlay();
    }
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      removeDropOverlay();
    }
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    removeDropOverlay();

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Collect file paths from dropped files (use webUtils API for Electron 40+)
    const filePaths = [];
    for (const file of files) {
      try {
        const fp = window.api.getPathForFile(file);
        if (fp) filePaths.push(fp);
      } catch {
        // Fallback for older Electron versions
        if (file.path) filePaths.push(file.path);
      }
    }

    if (filePaths.length === 0) return;

    // Validate dropped files via main process
    const validPaths = await window.api.validateDroppedFiles(filePaths);
    if (validPaths.length > 0) {
      loadPhotos(validPaths, { append: state.photos.length > 0 });
    }
  });
}

// ---- Initialize ----

// External links: open in system browser
function initExternalLinks() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="http"]');
    if (link) {
      e.preventDefault();
      window.api.openExternal(link.href);
    }
  });
}

els.dateTimeOptions.classList.toggle('hidden', !els.chkDateTime.checked);
els.locationOptions.classList.toggle('hidden', !els.chkLocation.checked);
els.addressOptions.classList.toggle('hidden', els.selLocationMode.value !== 'address');
els.customLocationOptions.classList.toggle('hidden', els.selLocationMode.value !== 'custom');
els.childAgeOptions.classList.toggle('hidden', !els.chkChildAge.checked);
els.strokeColorRow.classList.toggle('hidden', parseInt(els.rangeStrokeWidth.value) === 0);

initZoomPan();
initTokenInputs();
initTokenTest();
initQuotaButtons();
initDragAndDrop();
initExternalLinks();
loadSettings().then(() => {
  applyI18n();
});
