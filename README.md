# PhotoStamp (印迹)

A cross-platform batch photo watermarking tool built with Electron. Supports macOS / Windows / Linux.

[中文文档](./README_CN.md)

![Electron](https://img.shields.io/badge/Electron-40-47848F?logo=electron)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)

## Features

### Watermark Content

- **Shoot Time** — Auto-read EXIF data to stamp date/time, with 6 preset formats and custom patterns (YYYY/MM/DD/HH/mm/ss tokens)
- **Shoot Location** — Reverse geocode GPS coordinates, supports 3 display modes:
  - Address name with city / district / street level precision
  - Raw GPS coordinates
  - Custom text
- **Location Options** — Customizable location prefix (default 📍), hide province/state toggle, auto provider switching based on home country
- **Baby Age** — Set a birthday and auto-calculate the child's age at shooting time, with customizable prefix
- **Custom Text** — Add any custom watermark text

### Watermark Style

- **Font** — System font selection with cross-platform font discovery
- **Bold / Italic** — Toggle bold and italic font styles
- **Color & Opacity** — Full color picker with adjustable opacity
- **Font Size** — Auto-size or manual pixel setting
- **Stroke** — Adjustable stroke width and color
- **Shadow** — None / Light / Medium / Strong shadow presets
- **Position** — 5 positions: top-left, top-right, center, bottom-left, bottom-right
- **Text Alignment** — Left / Center / Right

### Processing & Output

- **Batch Processing** — Select multiple photos and add watermarks in one go
- **Drag & Drop** — Drop photos into the window; appends to existing list with auto-deduplication
- **Live Preview** — Instant preview with zoom and pan support
- **Multi-format Output** — Export as JPEG / PNG / WebP with adjustable quality
- **Auto Open Folder** — Optionally open the output folder after processing
- **Overwrite Detection** — Auto-detect existing files on export, with overwrite or skip options
- **Progress & Notification** — Taskbar progress bar during batch processing, system notification on completion

### App

- **i18n** — Chinese / English
- **Dark Mode** — Light / Dark / System theme
- **API Key Security** — API keys are encrypted via Electron safeStorage; keys never leave the main process
- **API Key Test & Usage** — Test connectivity per provider; quick link to provider console for usage stats
- **Settings Persistence** — All watermark config and UI state are auto-saved and restored

## Supported Image Formats

JPG / JPEG / PNG / HEIC / TIFF / WebP

## Map Providers

| Category | Providers |
|----------|-----------|
| Global | Google Maps, Mapbox, MapTiler |
| China | Amap (高德), Tencent LBS (腾讯), Tianditu (天地图), QWeather (和风天气) |

Supports automatic domestic/foreign provider switching based on home country settings (16 countries supported).

## Getting Started

### Prerequisites

- Node.js >= 18
- npm

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm start
# or with debug logging
npm run dev
```

### Build

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux

# All platforms
npm run build
```

Build output is located in the `dist/` directory.

## Project Structure

```
photostamp/
├── main.js              # Electron main process
├── preload.js           # Preload script (contextBridge)
├── lib/
│   ├── exif.js          # EXIF metadata reader
│   ├── fonts.js         # System font discovery
│   ├── fontconfig.js    # Fontconfig initialization
│   ├── geocoder.js      # Reverse geocoding (multi-provider)
│   ├── logger.js        # Logger
│   └── watermark.js     # Watermark engine (sharp + Pango)
├── renderer/
│   ├── index.html       # Main UI
│   ├── styles.css       # Styles
│   ├── app.js           # Renderer process logic
│   └── i18n.js          # Internationalization
├── assets/              # Icon assets
├── scripts/
│   └── obfuscate.js     # Build-time JS obfuscation
├── package.json
└── dist/                # Build output
```

## Tech Stack

- **Electron** — Cross-platform desktop app framework
- **sharp** — High-performance image processing (libvips + Pango text rendering)
- **ExifReader** — EXIF metadata parsing

## License

MIT
