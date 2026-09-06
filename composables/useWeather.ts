import { reactive } from 'vue';
import { fetchJSON, WMO_EMOJI } from '../utils/common';
import { K_WEATHER, storeGet, storeSet } from './useStorage';
import { useSettings } from './useSettings';
import { useToast } from './useToast';
import { useI18n } from '../utils/i18n';

interface GeoLoc {
  name: string;
  lat: number;
  lon: number;
}

/** 天气缓存有效期：20 分钟内重复展示复用缓存，不再请求定位/预报接口（手动刷新或保存设置时强制绕过） */
const WEATHER_CACHE_TTL = 20 * 60 * 1000;

const { t: tInit } = useI18n();

export const weather = reactive({
  emoji: '⏳',
  temp: '--',
  city: '',
  desc: tInit('weather.loading'),
  busy: false,
});

function fallbackCity(): GeoLoc {
  const { t } = useI18n();
  return { name: t('weather.fallbackCity'), lat: 39.9042, lon: 116.4074 };
}

async function resolveLocation(city: string): Promise<GeoLoc> {
  const { t, isZh } = useI18n();
  if (city) {
    // 显式指定了城市：定位失败直接抛出错误，绝不静默回退自动定位 / 默认北京
    const g = await fetchJSON<{ results?: { name: string; latitude: number; longitude: number }[] }>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${isZh.value ? 'zh' : 'en'}&format=json`
    );
    if (g.results?.length) {
      const r = g.results[0];
      return { name: r.name, lat: r.latitude, lon: r.longitude };
    }
    throw new Error(t('weather.notFound', { city }));
  }
  try {
    const ip = await fetchJSON<{ latitude?: number; longitude?: number; city?: string; region?: string }>(
      'https://ipapi.co/json/',
      4500
    );
    if (typeof ip.latitude === 'number' && typeof ip.longitude === 'number') {
      return { name: ip.city || ip.region || t('weather.current'), lat: ip.latitude, lon: ip.longitude };
    }
  } catch {
    /* 网络受限则用默认城市 */
  }
  return fallbackCity();
}

function renderWeather(loc: GeoLoc, data: { current?: Record<string, number> }) {
  const { t } = useI18n();
  const cur = data.current || {};
  const code = cur.weather_code ?? 3;
  const emoji = WMO_EMOJI[code] || '🌡️';
  weather.emoji = cur.is_day === 0 && [0, 1].includes(code) ? '🌙' : emoji;
  weather.temp = `${Math.round(cur.temperature_2m ?? 0)}°`;
  weather.city = loc.name;
  weather.desc = t('weather.desc', {
    desc: t('wmo.' + code),
    h: Math.round(cur.relative_humidity_2m ?? 0),
    w: Math.round(cur.wind_speed_10m ?? 0),
  });
}

export function useWeather() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const { t } = useI18n();

  interface WeatherCache {
    at: number;
    loc: GeoLoc;
    data: { current?: Record<string, number> };
  }

  async function loadWeather(force: boolean) {
    weather.busy = true;
    const city = settings.city.trim();

    try {
      // 有效缓存（同城市 + 20 分钟内）：直接展示，不发起任何请求
      if (!force) {
        const fresh = await storeGet<WeatherCache | null>(K_WEATHER, null);
        if (
          fresh?.at &&
          Date.now() - fresh.at < WEATHER_CACHE_TTL &&
          fresh.loc &&
          (!city || fresh.loc.name === city)
        ) {
          renderWeather(fresh.loc, fresh.data);
          return;
        }
      }

      const loc = await resolveLocation(city);
      const data = await fetchJSON<{ current?: Record<string, number> }>(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
          `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day&timezone=auto`
      );
      renderWeather(loc, data);
      storeSet(K_WEATHER, { at: Date.now(), loc, data });
    } catch (err) {
      // 兜底缓存仅在“未设置城市”或“缓存城市与当前设置一致”时可用，避免展示旧城市的天气
      const cache = await storeGet<WeatherCache | null>(K_WEATHER, null);
      const cacheUsable = !!cache?.loc && !!cache.data && (!city || cache.loc.name === city);
      if (cacheUsable) {
        renderWeather(cache.loc, cache.data);
      } else {
        weather.emoji = '⏳';
        weather.temp = '--';
        weather.city = '';
        weather.desc = t('weather.fail');
      }
      if (force) {
        const message = err instanceof Error ? err.message : '';
        toast(message && !message.startsWith('HTTP') && !message.startsWith('Failed') ? message : t('weather.failNetwork'));
      }
    } finally {
      weather.busy = false;
    }
  }

  return { weather, loadWeather };
}
