const https = require('https');
const http = require('http');
const zlib = require('zlib');
const log = require('./logger');

/**
 * 隐藏 URL 中的敏感参数（key/ak/token/username/email）
 */
function maskUrl(url) {
  return url.replace(
    /([?&])(key|ak|token|access_token|username|email)=([^&]+)/gi,
    (_, prefix, param, value) => `${prefix}${param}=${value.slice(0, 4)}****`
  );
}

/**
 * HTTP GET 请求（支持 http/https，自动处理 gzip/deflate 压缩）
 */
function httpGet(url) {
  log.debug('Geocoder', `GET ${maskUrl(url)}`);
  const lib = url.startsWith('https') ? https : http;
  const parsed = new URL(url);
  const options = {
    hostname: parsed.hostname,
    port: parsed.port,
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: { 'Accept-Encoding': 'gzip, deflate' },
  };
  return new Promise((resolve, reject) => {
    lib.request(options, (res) => {
      let stream = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }

      let data = '';
      stream.on('data', (chunk) => { data += chunk; });
      stream.on('end', () => {
        try {
          const json = JSON.parse(data);
          log.debug('Geocoder', `Response:`, JSON.stringify(json, null, 2));
          resolve(json);
        } catch (e) {
          log.error('Geocoder', `Failed to parse response:`, data);
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
      stream.on('error', (err) => {
        log.error('Geocoder', `Decompress error:`, err.message);
        reject(err);
      });
    }).on('error', (err) => {
      log.error('Geocoder', `Request error:`, err.message);
      reject(err);
    }).end();
  });
}


/**
 * 根据地理位置级别裁剪地址（国内）
 */
function trimAddressByLevel(components, level, hideProvince = false) {
  const { province, city, district, street, streetNumber } = components;
  const isDirectCity = province === city;

  switch (level) {
    case 'city':
      if (hideProvince || isDirectCity) return city;
      return `${province}${city}`;
    case 'district':
      if (hideProvince || isDirectCity) return `${city}${district}`;
      return `${province}${city}${district}`;
    case 'street':
    default:
      if (hideProvince || isDirectCity) return `${city}${district}${street || ''}${streetNumber || ''}`;
      return `${province}${city}${district}${street || ''}${streetNumber || ''}`;
  }
}

/**
 * 国外地址格式化（逗号分隔）
 */
function formatInternationalAddress(components, level, hideProvince) {
  switch (level) {
    case 'city':
      if (hideProvince) return components.city || components.province;
      return [components.city, components.province].filter(Boolean).join(', ');
    case 'district': {
      const parts = [components.district, components.city];
      if (!hideProvince) parts.push(components.province);
      return parts.filter(Boolean).join(', ');
    }
    case 'street':
    default: {
      const parts = [
        components.streetNumber ? `${components.streetNumber} ${components.street}` : components.street,
        components.district,
        components.city,
      ];
      if (!hideProvince) parts.push(components.province);
      return parts.filter(Boolean).join(', ');
    }
  }
}

// ==========================
// Provider: 高德 (Amap)
// ==========================
async function reverseGeocodeAmap(lat, lng, level, apiKey, hideProvince) {
  if (!apiKey) return '';
  const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(apiKey)}&location=${lng},${lat}&extensions=base`;
  const resp = await httpGet(url);

  if (resp.status !== '1' || !resp.regeocode) {
    throw new Error(`Amap API error: ${resp.info || 'unknown'}`);
  }

  const addr = resp.regeocode.addressComponent;
  // Amap returns empty arrays for out-of-range coordinates
  const toStr = (v) => (Array.isArray(v) ? '' : (v || ''));
  const components = {
    province: toStr(addr.province),
    city: Array.isArray(addr.city) ? toStr(addr.province) : toStr(addr.city),
    district: toStr(addr.district),
    street: toStr(addr.streetNumber?.street) || toStr(addr.township),
    streetNumber: toStr(addr.streetNumber?.number),
  };

  return trimAddressByLevel(components, level, hideProvince);
}

// ==========================
// Provider: Mapbox
// ==========================
async function reverseGeocodeMapbox(lat, lng, level, apiKey, hideProvince) {
  if (!apiKey) return '';

  const types = 'address,neighborhood,locality,district,place,region';
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(apiKey)}&language=en&types=${types}`;
  const resp = await httpGet(url);

  if (!resp.features || resp.features.length === 0) {
    return '';
  }

  const components = { province: '', city: '', district: '', street: '', streetNumber: '' };

  for (const feature of resp.features) {
    const ft = feature.place_type || [];
    if (ft.includes('address')) {
      components.streetNumber = feature.address || '';
      components.street = feature.text || '';
    }
    if (ft.includes('district')) {
      if (!components.district) components.district = feature.text || '';
    }
    if (ft.includes('neighborhood') || ft.includes('locality')) {
      if (!components.district) components.district = feature.text || '';
    }
    if (ft.includes('place')) {
      components.city = feature.text || '';
    }
    if (ft.includes('region')) {
      components.province = feature.text || '';
    }
  }

  return formatInternationalAddress(components, level, hideProvince);
}

// ==========================
// Provider: 腾讯位置服务 (Tencent LBS)
// ==========================
async function reverseGeocodeTencent(lat, lng, level, apiKey, hideProvince) {
  if (!apiKey) return '';

  const url = `https://apis.map.qq.com/ws/geocoder/v1/?location=${lat},${lng}&key=${encodeURIComponent(apiKey)}&get_poi=0`;
  const resp = await httpGet(url);

  if (resp.status !== 0 || !resp.result) {
    throw new Error(`Tencent LBS error: ${resp.message || 'unknown'}`);
  }

  const ac = resp.result.address_component || {};
  const components = {
    province: ac.province || '',
    city: ac.city || '',
    district: ac.district || '',
    street: ac.street || '',
    streetNumber: ac.street_number || '',
  };

  return trimAddressByLevel(components, level, hideProvince);
}

// ==========================
// Provider: 天地图 (Tianditu)
// ==========================
async function reverseGeocodeTianditu(lat, lng, level, apiKey, hideProvince) {
  if (!apiKey) return '';

  const postStr = JSON.stringify({
    lon: lng,
    lat: lat,
    ver: 1,
  });
  const url = `https://api.tianditu.gov.cn/geocoder?postStr=${encodeURIComponent(postStr)}&type=geocode&tk=${encodeURIComponent(apiKey)}`;
  const resp = await httpGet(url);

  if (resp.status !== '0' && resp.status !== 0) {
    throw new Error(`Tianditu error: ${resp.msg || 'unknown'}`);
  }

  const result = resp.result || {};
  const ac = result.addressComponent || {};
  const components = {
    province: ac.province || '',
    city: ac.city || '',
    district: ac.county || ac.district || '',
    street: ac.road || ac.street || '',
    streetNumber: ac.street_number || ac.address || '',
  };

  return trimAddressByLevel(components, level, hideProvince);
}

// ==========================
// Provider: MapTiler
// ==========================
async function reverseGeocodeMapTiler(lat, lng, level, apiKey, hideProvince) {
  if (!apiKey) return '';

  const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${encodeURIComponent(apiKey)}`;
  const resp = await httpGet(url);

  if (!resp.features || resp.features.length === 0) {
    return '';
  }

  const components = { province: '', city: '', district: '', street: '', streetNumber: '' };

  for (const feature of resp.features) {
    const ft = feature.place_type || [];
    if (ft.includes('address')) {
      components.street = feature.text || '';
      components.streetNumber = feature.address || '';
    }
    if (ft.includes('municipality') || ft.includes('municipal_district')) {
      if (!components.district) components.district = feature.text || '';
    }
    if (ft.includes('place') || ft.includes('city')) {
      if (!components.city) components.city = feature.text || '';
    }
    if (ft.includes('region') || ft.includes('state')) {
      if (!components.province) components.province = feature.text || '';
    }
  }

  // Fallback: try context array for structured data
  if (resp.features.length > 0) {
    const main = resp.features[0];
    if (main.context) {
      for (const ctx of main.context) {
        const cid = ctx.id || '';
        if (cid.startsWith('municipality') || cid.startsWith('municipal_district')) {
          if (!components.district) components.district = ctx.text || '';
        }
        if (cid.startsWith('place') || cid.startsWith('city')) {
          if (!components.city) components.city = ctx.text || '';
        }
        if (cid.startsWith('region') || cid.startsWith('state')) {
          if (!components.province) components.province = ctx.text || '';
        }
      }
    }
  }

  return formatInternationalAddress(components, level, hideProvince);
}

// ==========================
// Provider: Google Maps
// ==========================
async function reverseGeocodeGoogle(lat, lng, level, apiKey, hideProvince) {
  if (!apiKey) return '';

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(apiKey)}&language=en`;
  const resp = await httpGet(url);

  if (resp.status !== 'OK' || !resp.results || resp.results.length === 0) {
    throw new Error(`Google Geocoding error: ${resp.error_message || resp.status || 'unknown'}`);
  }

  const components = { province: '', city: '', district: '', street: '', streetNumber: '' };

  // Parse address_components from the first result
  const addrComponents = resp.results[0].address_components || [];
  for (const comp of addrComponents) {
    const types = comp.types || [];
    if (types.includes('street_number')) {
      components.streetNumber = comp.long_name;
    }
    if (types.includes('route')) {
      components.street = comp.long_name;
    }
    if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
      if (!components.district) components.district = comp.long_name;
    }
    if (types.includes('locality')) {
      components.city = comp.long_name;
    }
    if (types.includes('administrative_area_level_1')) {
      components.province = comp.long_name;
    }
  }

  // Check if it's a Chinese address (contains CJK characters)
  const fullAddr = JSON.stringify(components);
  const isChinese = /[\u4e00-\u9fff]/.test(fullAddr);

  if (isChinese) {
    return trimAddressByLevel(components, level, hideProvince);
  }
  return formatInternationalAddress(components, level, hideProvince);
}

// ==========================
// Provider: 和风天气 (QWeather)
// ==========================
async function reverseGeocodeQWeather(lat, lng, level, apiKey, hideProvince) {
  if (!apiKey) return '';

  // QWeather GeoAPI: lookup location by coordinates
  const url = `https://geoapi.qweather.com/v2/city/lookup?location=${lng},${lat}&key=${encodeURIComponent(apiKey)}&number=1`;
  const resp = await httpGet(url);

  if (resp.code !== '200' || !resp.location || resp.location.length === 0) {
    throw new Error(`QWeather error: code=${resp.code || 'unknown'}`);
  }

  const loc = resp.location[0];
  const adm1 = loc.adm1 || '';
  const adm2 = loc.adm2 || '';
  const name = loc.name || '';

  // QWeather adm1 may have trailing "市/省/自治区" that adm2 lacks (e.g. adm1="北京市", adm2="北京")
  // Normalize: if adm1 starts with adm2, treat them as the same (direct-administered city)
  const isDirect = adm2 && (adm1 === adm2 || adm1.startsWith(adm2));
  const province = isDirect ? adm2 : adm1;
  const city = adm2;

  const components = {
    province,
    city,
    district: (name && name !== city) ? name : '',
    street: '',
    streetNumber: '',
  };

  // Check if Chinese
  const isChinese = /[\u4e00-\u9fff]/.test(components.province + components.city);

  if (isChinese) {
    return trimAddressByLevel(components, level, hideProvince);
  }
  return formatInternationalAddress(components, level, hideProvince);
}

// ==========================
// Country detection helpers
// ==========================

/**
 * 判断坐标是否在中国境内（粗略判断）
 */
function isInChina(lat, lng) {
  // Mainland + Hainan (exclude South China Sea islands to avoid false positives for SE Asia)
  return lat >= 18.0 && lat <= 53.55 && lng >= 73.66 && lng <= 135.05;
}

/**
 * 所有支持的服务商
 */
const PROVIDERS = {
  amap: { name: '高德地图', fn: reverseGeocodeAmap, keyField: 'amap' },
  tencent: { name: '腾讯位置服务', fn: reverseGeocodeTencent, keyField: 'tencent' },
  tianditu: { name: '天地图', fn: reverseGeocodeTianditu, keyField: 'tianditu' },
  google: { name: 'Google Maps', fn: reverseGeocodeGoogle, keyField: 'google' },
  mapbox: { name: 'Mapbox', fn: reverseGeocodeMapbox, keyField: 'mapbox' },
  maptiler: { name: 'MapTiler', fn: reverseGeocodeMapTiler, keyField: 'maptiler' },
  qweather: { name: '和风天气', fn: reverseGeocodeQWeather, keyField: 'qweather' },
};

/**
 * 反向地理编码
 * @param {object} params
 *   provider: 服务商 ID 或 'auto'
 *   level: 'city' | 'district' | 'street'
 *   apiKeys: { amap?, tencent?, tianditu?, mapbox?, maptiler? }
 *   hideProvince: boolean
 *   homeCountries: string[] - 本国国家代码列表 (如 ['CN'])
 *   domesticProvider: string - 本国使用的服务商
 *   foreignProvider: string - 非本国使用的服务商
 */
async function reverseGeocode({
  lat, lng,
  provider = 'auto',
  level = 'street',
  apiKeys = {},
  hideProvince = false,
  homeCountries = [],
  domesticProvider = '',
  foreignProvider = '',
}) {
  let useProvider = provider;

  if (useProvider === 'auto') {
    // 判断是否在本国范围内
    const isDomestic = isDomesticLocation(lat, lng, homeCountries);
    if (isDomestic && domesticProvider && apiKeys[domesticProvider]) {
      useProvider = domesticProvider;
    } else if (!isDomestic && foreignProvider && apiKeys[foreignProvider]) {
      useProvider = foreignProvider;
    } else {
      // fallback: 用 isInChina 逻辑
      useProvider = isInChina(lat, lng)
        ? findFirstAvailable(['amap', 'tencent', 'tianditu', 'qweather'], apiKeys)
        : findFirstAvailable(['mapbox', 'maptiler', 'google'], apiKeys);
      if (!useProvider) {
        return '';
      }
    }
  }

  const p = PROVIDERS[useProvider];
  if (!p) return '';

  const key = apiKeys[p.keyField];
  return p.fn(lat, lng, level, key, hideProvince);
}

/**
 * 判断坐标是否在本国范围内
 */
function isDomesticLocation(lat, lng, homeCountries) {
  if (!homeCountries || homeCountries.length === 0) {
    return isInChina(lat, lng);
  }

  // 粗略的国家边界框
  const COUNTRY_BOUNDS = {
    CN: { latMin: 18.0, latMax: 53.55, lngMin: 73.66, lngMax: 135.05 },
    US: { latMin: 24.39, latMax: 49.38, lngMin: -125.0, lngMax: -66.93 },
    JP: { latMin: 24.0, latMax: 45.55, lngMin: 122.93, lngMax: 153.99 },
    KR: { latMin: 33.1, latMax: 38.63, lngMin: 124.6, lngMax: 131.87 },
    GB: { latMin: 49.9, latMax: 58.7, lngMin: -8.65, lngMax: 1.76 },
    DE: { latMin: 47.27, latMax: 55.06, lngMin: 5.87, lngMax: 15.04 },
    FR: { latMin: 41.33, latMax: 51.09, lngMin: -5.14, lngMax: 9.56 },
    AU: { latMin: -43.64, latMax: -10.06, lngMin: 113.34, lngMax: 153.64 },
    CA: { latMin: 41.68, latMax: 83.11, lngMin: -141.0, lngMax: -52.62 },
    RU: { latMin: 41.19, latMax: 81.86, lngMin: 19.64, lngMax: 180, crossDateLine: true, lngMin2: -180, lngMax2: -169.05 },
    IN: { latMin: 6.75, latMax: 35.5, lngMin: 68.11, lngMax: 97.4 },
    BR: { latMin: -33.75, latMax: 5.27, lngMin: -73.99, lngMax: -34.79 },
    TH: { latMin: 5.61, latMax: 20.46, lngMin: 97.35, lngMax: 105.64 },
    SG: { latMin: 1.15, latMax: 1.47, lngMin: 103.6, lngMax: 104.0 },
    MY: { latMin: 0.85, latMax: 7.36, lngMin: 99.64, lngMax: 119.27 },
    VN: { latMin: 8.18, latMax: 23.39, lngMin: 102.14, lngMax: 109.46 },
  };

  for (const code of homeCountries) {
    const bounds = COUNTRY_BOUNDS[code];
    if (bounds) {
      const latOk = lat >= bounds.latMin && lat <= bounds.latMax;
      if (!latOk) continue;
      if (bounds.crossDateLine) {
        // Crosses the International Date Line: use OR logic for longitude
        if (lng >= bounds.lngMin || lng <= bounds.lngMax2) return true;
      } else {
        if (lng >= bounds.lngMin && lng <= bounds.lngMax) return true;
      }
    }
  }
  return false;
}

function findFirstAvailable(providerIds, apiKeys) {
  for (const id of providerIds) {
    const p = PROVIDERS[id];
    if (p && apiKeys[p.keyField]) return id;
  }
  return providerIds[0]; // fallback to first even without key
}

module.exports = { reverseGeocode, PROVIDERS };
