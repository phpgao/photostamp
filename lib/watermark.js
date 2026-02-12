// MUST init fontconfig BEFORE require('sharp') so Pango picks up system fonts
require('./fontconfig');

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const log = require('./logger');
const { readExif } = require('./exif');
const { reverseGeocode } = require('./geocoder');

// ---- i18n ----
const i18n = {
  zh: {
    years: '岁',
    months: '个月',
    days: '天',
    zeroDay: '0天',
  },
  en: {
    years: (n) => n === 1 ? ' year' : ' years',
    months: (n) => n === 1 ? ' month' : ' months',
    days: (n) => n === 1 ? ' day' : ' days',
    zeroDay: '0 days',
  },
};

/**
 * 计算宝宝年龄
 * @param {string} birthday 生日 YYYY-MM-DD
 * @param {string} photoDate 拍摄日期 YYYY-MM-DD HH:mm:ss
 * @param {string} format 'years' | 'years-months' | 'years-months-days'
 * @param {string} lang 'zh' | 'en'
 * @returns {string}
 */
function calcChildAge(birthday, photoDate, format = 'years-months', lang = 'zh') {
  const birth = new Date(birthday);
  const photo = new Date(photoDate);

  if (isNaN(birth.getTime()) || isNaN(photo.getTime())) return '';
  if (photo < birth) return '';

  let years = photo.getFullYear() - birth.getFullYear();
  let months = photo.getMonth() - birth.getMonth();
  let days = photo.getDate() - birth.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(photo.getFullYear(), photo.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const t = i18n[lang] || i18n.zh;

  if (lang === 'en') {
    switch (format) {
      case 'years':
        return `${years}${t.years(years)}`;
      case 'years-months':
        if (years === 0) return `${months}${t.months(months)}`;
        if (months === 0) return `${years}${t.years(years)}`;
        return `${years}${t.years(years)} ${months}${t.months(months)}`;
      case 'years-months-days': {
        const parts = [];
        if (years > 0) parts.push(`${years}${t.years(years)}`);
        if (months > 0) parts.push(`${months}${t.months(months)}`);
        if (days > 0) parts.push(`${days}${t.days(days)}`);
        return parts.length > 0 ? parts.join(' ') : t.zeroDay;
      }
      default:
        return `${years}${t.years(years)} ${months}${t.months(months)}`;
    }
  }

  // Chinese
  switch (format) {
    case 'years':
      return `${years}${t.years}`;
    case 'years-months':
      if (years === 0) return `${months}${t.months}`;
      if (months === 0) return `${years}${t.years}`;
      return `${years}${t.years}${months}${t.months}`;
    case 'years-months-days': {
      const parts = [];
      if (years > 0) parts.push(`${years}${t.years}`);
      if (months > 0) parts.push(`${months}${t.months}`);
      if (days > 0) parts.push(`${days}${t.days}`);
      return parts.length > 0 ? parts.join('') : t.zeroDay;
    }
    default:
      return `${years}${t.years}${months}${t.months}`;
  }
}

/**
 * 格式化拍摄时间
 */
function formatDateTime(dateStr, format) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const pad = (n) => String(n).padStart(2, '0');

  const replacements = {
    'YYYY': d.getFullYear(),
    'YY': String(d.getFullYear()).slice(-2),
    'MM': pad(d.getMonth() + 1),
    'M': d.getMonth() + 1,
    'DD': pad(d.getDate()),
    'D': d.getDate(),
    'HH': pad(d.getHours()),
    'H': d.getHours(),
    'mm': pad(d.getMinutes()),
    'm': d.getMinutes(),
    'ss': pad(d.getSeconds()),
    's': d.getSeconds(),
  };

  let result = format;
  for (const [token, value] of Object.entries(replacements).sort((a, b) => b[0].length - a[0].length)) {
    result = result.replace(new RegExp(token, 'g'), String(value));
  }
  return result;
}

/**
 * 构建水印文本行
 */
async function buildWatermarkLines(filePath, options) {
  const exif = await readExif(filePath);
  const lines = [];

  // 拍摄时间
  if (options.showDateTime && exif.dateTime) {
    const fmt = options.dateTimeFormat || 'YYYY-MM-DD HH:mm';
    lines.push(formatDateTime(exif.dateTime, fmt));
  }

  // 地理位置
  if (options.showLocation) {
    let locationText = '';
    
    if (exif.gps) {
      if (options.locationMode === 'coords') {
        locationText = `${exif.gps.lat.toFixed(6)}, ${exif.gps.lng.toFixed(6)}`;
      } else if (options.locationMode === 'custom') {
        // 有GPS但选择自定义模式，使用自定义位置（如果提供的话）
        locationText = options.customLocation || `${exif.gps.lat.toFixed(6)}, ${exif.gps.lng.toFixed(6)}`;
      } else {
        try {
          locationText = await reverseGeocode({
            lat: exif.gps.lat,
            lng: exif.gps.lng,
            provider: options.geoProvider || 'auto',
            level: options.locationLevel || 'street',
            apiKeys: options.apiKeys || {},
            hideProvince: options.hideProvince || false,
            homeCountries: options.homeCountries || [],
            domesticProvider: options.domesticProvider || '',
            foreignProvider: options.foreignProvider || '',
          });
        } catch {
          locationText = '';
        }
      }
    } else if (options.locationMode === 'custom' && options.customLocation) {
      // 没有GPS，但用户提供了自定义位置
      locationText = options.customLocation;
    }

    if (locationText) {
      // 添加位置前缀
      const prefix = options.locationPrefix != null ? options.locationPrefix : '📍';
      if (prefix) {
        locationText = `${prefix} ${locationText}`;
      }
      lines.push(locationText);
    }
  }

  // 宝宝年龄
  if (options.showChildAge && options.childBirthday && exif.dateTime) {
    const lang = options.lang || 'zh';
    const age = calcChildAge(options.childBirthday, exif.dateTime, options.childAgeFormat || 'years-months', lang);
    if (age) {
      const prefix = options.childAgePrefix || '';
      lines.push(prefix ? `${prefix} ${age}` : age);
    }
  }

  // 自定义文本
  if (options.customText) {
    lines.push(options.customText);
  }

  return { lines, exif };
}

/**
 * 生成水印覆盖层（使用 sharp text API 支持自定义字体和对齐）
 */
async function createWatermarkOverlay(lines, imgWidth, imgHeight, options) {
  if (lines.length === 0) return null;

  const color = options.watermarkColor || '#FFFFFF';
  const opacity = options.watermarkOpacity != null ? options.watermarkOpacity : 0.85;
  const shadowColor = options.shadowColor || 'rgba(0,0,0,0.6)';
  const position = options.watermarkPosition || 'bottom-right';
  const textAlign = options.textAlign || 'left'; // 'left' | 'center' | 'right'

  const baseFontSize = Math.max(Math.round(Math.min(imgWidth, imgHeight) * 0.028), 16);
  const fontSize = options.fontSize || baseFontSize;
  const padding = Math.round(fontSize * 1.2);

  // Font handling: put font family in both `font_desc` (Pango markup) AND sharp's
  // `font` option. The `font` option serves as fallback for CJK glyphs when the
  // primary font doesn't contain them; `font_desc` ensures Pango uses the font for
  // all matched glyphs including CJK characters.
  let fontFamily = options.fontFamily || '';

  // Pango handles English family names reliably but often fails with non-ASCII
  // (e.g. Chinese) names. If the font family contains non-ASCII chars, resolve
  // it to the fontconfig canonical (usually English) name via fc-match.
  if (fontFamily && /[^\x20-\x7E]/.test(fontFamily)) {
    try {
      const resolved = execFileSync('fc-match', [fontFamily, '--format=%{family[0]}'], {
        encoding: 'utf-8',
        env: process.env,
        timeout: 5000,
        windowsHide: true,
      }).trim();
      if (resolved && /^[\x20-\x7E]+$/.test(resolved)) {
        log.info('Watermark', `[FONT] Resolved non-ASCII "${fontFamily}" => "${resolved}"`);
        fontFamily = resolved;
      }
    } catch (e) {
      log.info('Watermark', `[FONT] fc-match resolve failed: ${e.message}`);
    }
  }

  // Build Pango font description: "Family Bold Italic Size"
  const fontStyle = [
    options.fontBold ? 'Bold' : '',
    options.fontItalic ? 'Italic' : '',
  ].filter(Boolean).join(' ');
  const fontDescParts = [fontFamily, fontStyle, fontSize].filter(Boolean);
  const fontDesc = fontDescParts.join(' ');

  // Escape Pango markup special chars
  const esc = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // Convert color to Pango hex (strip alpha if present)
  const pangoColor = color.length === 9 ? color.slice(0, 7) : color;

  // Build Pango markup text with alignment
  const pangoLines = lines.map(l => esc(l)).join('\n');
  const pangoText = `<span foreground="${pangoColor}" font_desc="${fontDesc}">${pangoLines}</span>`;

  // sharp text options — 'align' controls multi-line text alignment
  // Valid values for sharp/Pango: 'left', 'centre', 'right'
  const sharpAlign = textAlign === 'center' ? 'centre' : textAlign;

  // ---- Text stroke (outline) ----
  // strokeWidth: 0 means no stroke, otherwise use the exact pixel value from options
  const strokeWidth = options.strokeWidth != null ? options.strokeWidth : Math.max(Math.round(fontSize * 0.08), 1);
  const strokeColor = options.strokeColor || '#000000';
  const parsedStroke = parseShadowColor(strokeColor);

  // ---- Shadow effect level ----
  // shadowEffect: 'none' | 'light' | 'medium' | 'strong'
  const shadowEffect = options.shadowEffect || 'medium';
  const shadowEnabled = shadowEffect !== 'none';
  const SHADOW_PRESETS = {
    none:   { blur: 0, offset: 0, alpha: 0 },
    light:  { blur: Math.max(fontSize * 0.08, 1), offset: Math.max(Math.round(fontSize * 0.03), 1), alpha: 0.3 },
    medium: { blur: Math.max(fontSize * 0.15, 1.5), offset: Math.max(Math.round(fontSize * 0.06), 1), alpha: 0.6 },
    strong: { blur: Math.max(fontSize * 0.25, 2), offset: Math.max(Math.round(fontSize * 0.08), 2), alpha: 0.85 },
  };
  const shadowParams = SHADOW_PRESETS[shadowEffect] || SHADOW_PRESETS.medium;

  // Build stroke Pango text (dark color, same font)
  const strokePangoText = `<span foreground="${parsedStroke.hex}" font_desc="${fontDesc}">${pangoLines}</span>`;
  const baseTextOpts = { rgba: true, dpi: 72, align: sharpAlign };
  if (fontFamily) baseTextOpts.font = fontFamily;

  // Generate the main text image first to get dimensions
  const mainPangoText = pangoText;
  const textBuf = await sharp({ text: { ...baseTextOpts, text: mainPangoText } }).png().toBuffer({ resolveWithObject: true });
  const textW = textBuf.info.width;
  const textH = textBuf.info.height;

  const strokeEnabled = strokeWidth > 0;
  const strokePadding = strokeEnabled ? strokeWidth * 2 : 0;
  const canvasW = textW + strokePadding * 2;
  const canvasH = textH + strokePadding * 2;

  // ---- Main text layer (with opacity) ----
  let textLayer = sharp(textBuf.data);
  if (opacity < 1) {
    const opacityBuf = await sharp({
      create: { width: textW, height: textH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: opacity } },
    }).png().toBuffer();
    textLayer = sharp(textBuf.data).composite([
      { input: opacityBuf, blend: 'dest-in' },
    ]);
  }
  const finalTextBuf = await textLayer.png().toBuffer();

  // ---- Build combined text buffer (stroke + text on padded canvas, or just text) ----
  let combinedTextBuf;
  if (strokeEnabled) {
    const strokeTextBuf = await sharp({ text: { ...baseTextOpts, text: strokePangoText } }).png().toBuffer();

    // Generate offset composites for the stroke (multiple directions)
    const offsets = [];
    for (let dx = -strokeWidth; dx <= strokeWidth; dx += Math.max(1, Math.round(strokeWidth / 2))) {
      for (let dy = -strokeWidth; dy <= strokeWidth; dy += Math.max(1, Math.round(strokeWidth / 2))) {
        if (dx === 0 && dy === 0) continue;
        offsets.push({ input: strokeTextBuf, top: strokePadding + dy, left: strokePadding + dx });
      }
    }

    // Build stroke canvas
    let strokeCanvas = sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(offsets);

    // Apply stroke opacity
    if (parsedStroke.alpha < 1) {
      const strokeOpacityBuf = await sharp({
        create: { width: canvasW, height: canvasH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: parsedStroke.alpha } },
      }).png().toBuffer();
      strokeCanvas = strokeCanvas.composite([{ input: await strokeCanvas.png().toBuffer() }]);
      strokeCanvas = sharp({
        create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      }).composite([
        { input: await strokeCanvas.png().toBuffer(), top: 0, left: 0 },
      ]);
      const strokeBufTmp = await strokeCanvas.png().toBuffer();
      strokeCanvas = sharp(strokeBufTmp).composite([{ input: strokeOpacityBuf, blend: 'dest-in' }]);
    }

    // Blur stroke slightly for smoother edges
    const strokeBlur = Math.max(strokeWidth * 0.4, 0.5);
    const finalStrokeBuf = await strokeCanvas.blur(strokeBlur).png().toBuffer();

    // Combine stroke + text on padded canvas
    combinedTextBuf = await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([
      { input: finalStrokeBuf, top: 0, left: 0 },
      { input: finalTextBuf, top: strokePadding, left: strokePadding },
    ]).png().toBuffer();
  } else {
    // No stroke — just use the text buffer directly
    combinedTextBuf = finalTextBuf;
  }

  // ---- Shadow layer ----
  let finalShadowBuf = null;
  const shadowOffset = shadowParams.offset;
  if (shadowEnabled) {
    const parsedShadow = parseShadowColor(shadowColor);
    // Override shadow alpha with effect-level alpha
    const effectiveShadowAlpha = Math.min(parsedShadow.alpha, shadowParams.alpha);
    const shadowPangoText = `<span foreground="${parsedShadow.hex}" font_desc="${fontDesc}">${pangoLines}</span>`;
    const shadowBuf = await sharp({ text: { ...baseTextOpts, text: shadowPangoText } }).png().toBuffer({ resolveWithObject: true });

    let shadowLayer = sharp(shadowBuf.data).blur(shadowParams.blur);
    const shadowAlpha = effectiveShadowAlpha;
    if (shadowAlpha < 1) {
      const shadowOpacityBuf = await sharp({
        create: { width: shadowBuf.info.width, height: shadowBuf.info.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: shadowAlpha } },
      }).png().toBuffer();
      shadowLayer = shadowLayer.composite([{ input: shadowOpacityBuf, blend: 'dest-in' }]);
    }
    finalShadowBuf = await shadowLayer.png().toBuffer();
  }

  // ---- Calculate position ----
  let x, y;
  switch (position) {
    case 'top-left':
      x = padding - strokePadding;
      y = padding - strokePadding;
      break;
    case 'top-right':
      x = imgWidth - canvasW - padding + strokePadding;
      y = padding - strokePadding;
      break;
    case 'bottom-left':
      x = padding - strokePadding;
      y = imgHeight - canvasH - padding + strokePadding;
      break;
    case 'bottom-right':
    default:
      x = imgWidth - canvasW - padding + strokePadding;
      y = imgHeight - canvasH - padding + strokePadding;
      break;
    case 'center':
      x = Math.round((imgWidth - canvasW) / 2);
      y = Math.round((imgHeight - canvasH) / 2);
      break;
  }

  // Clamp to image bounds
  x = Math.max(-strokePadding, Math.min(x, imgWidth - canvasW + strokePadding));
  y = Math.max(-strokePadding, Math.min(y, imgHeight - canvasH + strokePadding));

  // Build composite instructions
  const composites = [];

  if (finalShadowBuf) {
    const shadowX = x + strokePadding + shadowOffset;
    const shadowY = y + strokePadding + shadowOffset;
    composites.push({ input: finalShadowBuf, top: Math.max(0, shadowY), left: Math.max(0, shadowX) });
  }

  composites.push({ input: combinedTextBuf, top: Math.max(0, y), left: Math.max(0, x) });

  return composites;
}

/**
 * 解析阴影颜色（支持 rgba(...) 和 hex）
 */
function parseShadowColor(color) {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]), g = parseInt(rgbaMatch[2]), b = parseInt(rgbaMatch[3]);
    const a = rgbaMatch[4] != null ? parseFloat(rgbaMatch[4]) : 1;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    return { hex, alpha: a };
  }
  return { hex: color.length === 9 ? color.slice(0, 7) : color, alpha: 1 };
}

/**
 * 生成预览（返回 base64）
 */
async function generatePreview(filePath, options) {
  const { lines } = await buildWatermarkLines(filePath, options);
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;

  const maxPreview = 800;
  const scale = Math.min(maxPreview / width, maxPreview / height, 1);
  const previewW = Math.round(width * scale);
  const previewH = Math.round(height * scale);

  const previewOptions = {
    ...options,
    fontSize: options.fontSize ? Math.round(options.fontSize * scale) : undefined,
    strokeWidth: options.strokeWidth ? Math.max(Math.round(options.strokeWidth * scale), 1) : options.strokeWidth,
  };

  const composites = await createWatermarkOverlay(lines, previewW, previewH, previewOptions);

  let pipeline = image.resize(previewW, previewH, { fit: 'inside' });
  if (composites) {
    pipeline = pipeline.composite(composites);
  }

  const buf = await pipeline.jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/**
 * 计算输出文件路径（统一逻辑，供 main.js 也使用）
 */
const OUTPUT_EXT_MAP = { jpeg: '.jpg', png: '.png', webp: '.webp' };

function getOutputPath(inputPath, outputDir, outputFormat) {
  const ext = path.extname(inputPath).toLowerCase();
  const baseName = path.basename(inputPath, ext);
  const outExt = OUTPUT_EXT_MAP[outputFormat] || '.jpg';
  return path.join(outputDir, `${baseName}_wm${outExt}`);
}

/**
 * 处理单张照片，添加水印并保存
 */
async function processPhotos(filePath, outputDir, options) {
  const { lines } = await buildWatermarkLines(filePath, options);
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;

  const composites = await createWatermarkOverlay(lines, width, height, options);

  let pipeline = image;
  if (composites) {
    pipeline = pipeline.composite(composites);
  }

  const outputFormat = options.outputFormat || 'jpeg';
  const quality = options.outputQuality || 92;
  const outputPath = getOutputPath(filePath, outputDir, outputFormat);

  switch (outputFormat) {
    case 'png':
      await pipeline.png({ quality }).toFile(outputPath);
      break;
    case 'webp':
      await pipeline.webp({ quality }).toFile(outputPath);
      break;
    case 'jpeg':
    default:
      await pipeline.jpeg({ quality }).toFile(outputPath);
      break;
  }

  return outputPath;
}

module.exports = { processPhotos, generatePreview, calcChildAge, formatDateTime, getOutputPath, OUTPUT_EXT_MAP };
