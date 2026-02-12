const ExifReader = require('exifreader');
const fs = require('fs');

/**
 * 读取照片 EXIF 信息
 * @param {string} filePath 文件路径
 * @returns {object} { dateTime, gps: { lat, lng }, make, model, width, height }
 */
async function readExif(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  const tags = ExifReader.load(buffer, { expanded: true });

  const result = {
    dateTime: null,
    gps: null,
    make: null,
    model: null,
    width: null,
    height: null,
  };

  // 拍摄时间
  if (tags.exif) {
    const dt = tags.exif.DateTimeOriginal || tags.exif.DateTime;
    if (dt) {
      // EXIF 格式: "2024:01:15 14:30:00"
      const raw = dt.description || dt.value;
      if (raw) {
        const normalized = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
        result.dateTime = normalized;
      }
    }
  }

  // GPS 信息
  if (tags.gps && tags.gps.Latitude !== undefined && tags.gps.Longitude !== undefined) {
    result.gps = {
      lat: tags.gps.Latitude,
      lng: tags.gps.Longitude,
    };
  }

  // 相机信息
  if (tags.exif) {
    if (tags.exif.Make) result.make = tags.exif.Make.description;
    if (tags.exif.Model) result.model = tags.exif.Model.description;
  }

  // 图片尺寸
  if (tags.file) {
    if (tags.file['Image Width']) result.width = tags.file['Image Width'].value;
    if (tags.file['Image Height']) result.height = tags.file['Image Height'].value;
  }
  if (!result.width && tags.exif) {
    if (tags.exif.PixelXDimension) result.width = tags.exif.PixelXDimension.value;
    if (tags.exif.PixelYDimension) result.height = tags.exif.PixelYDimension.value;
  }

  return result;
}

module.exports = { readExif };
