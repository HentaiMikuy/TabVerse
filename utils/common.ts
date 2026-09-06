/* ---------------- 静态配置与工具 ---------------- */

export interface QuickLink {
  name: string;
  url: string;
}

/** 自定义背景类型：无 / 图片 / 视频 */
export type BgType = 'none' | 'image' | 'video';

/** 界面显示语言：auto 跟随浏览器 */
export type Lang = 'auto' | 'zh-CN' | 'en';

export interface Settings {
  engineId: string;
  theme: 'light' | 'dark';
  city: string;
  /** GitHub 贡献热力图时间范围：最近三个月 / 半年 / 一年 / 两年 / 全部 */
  ghHeatRange: HeatRange;
  /** GitHub OAuth App 的 Client ID（公开值，用于 Device Flow 登录提升 API 配额） */
  ghClientId: string;
  /** 简约模式：仅显示时间日期与搜索框 */
  minimal: boolean;
  /** 自定义背景类型（背景地址存 chrome.storage.local，见 useBackground） */
  bgType: BgType;
  /** 背景遮罩不透明度 0~1，保证前景文字可读 */
  bgScrim: number;
  /** 时钟时区（IANA 时区 ID，空字符串表示跟随系统本地时间） */
  timezone: string;
  /** 界面显示语言 */
  lang: Lang;
}

/** 贡献热力图显示时间范围 */
export type HeatRange = 'quarter' | 'half' | 'year' | 'two' | 'all';

/** 各范围对应的天数（全部历史为无限） */
export const HEAT_RANGE_DAYS: Record<HeatRange, number> = {
  quarter: 90,
  half: 183,
  year: 365,
  two: 730,
  all: Infinity,
};

export interface Todo {
  id: number;
  text: string;
  done: boolean;
  due?: string; // 截止日期 YYYY-MM-DD（可选）
  priority?: number; // 0=低 1=中 2=高（默认中）
}

export interface Engine {
  id: string;
  name: string;
  url: string;
}

export const ENGINES: Engine[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s' },
  { id: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=%s' },
];

export const DEFAULT_LINKS: QuickLink[] = [
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Bilibili', url: 'https://www.bilibili.com' },
  { name: '知乎', url: 'https://www.zhihu.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: '掘金', url: 'https://juejin.cn' },
  { name: 'V2EX', url: 'https://www.v2ex.com' },
  { name: '百度', url: 'https://www.baidu.com' },
];

export const DEFAULT_SETTINGS: Settings = {
  engineId: 'google',
  theme: 'light',
  city: '',
  ghHeatRange: 'year',
  ghClientId: '',
  minimal: false,
  bgType: 'none',
  bgScrim: 0.35,
  timezone: '',
  lang: 'auto',
};

/** 可选的时钟时区（IANA 时区 ID），空字符串表示跟随系统本地时间；name 按语言提供 */
export const TIMEZONES: { id: string; name: { zh: string; en: string } }[] = [
  { id: '', name: { zh: '跟随系统（本地时间）', en: 'Follow system (local time)' } },
  { id: 'Asia/Shanghai', name: { zh: '北京', en: 'Beijing' } },
  { id: 'Asia/Hong_Kong', name: { zh: '香港', en: 'Hong Kong' } },
  { id: 'Asia/Taipei', name: { zh: '台北', en: 'Taipei' } },
  { id: 'Asia/Tokyo', name: { zh: '东京', en: 'Tokyo' } },
  { id: 'Asia/Seoul', name: { zh: '首尔', en: 'Seoul' } },
  { id: 'Asia/Singapore', name: { zh: '新加坡', en: 'Singapore' } },
  { id: 'Australia/Sydney', name: { zh: '悉尼', en: 'Sydney' } },
  { id: 'Europe/London', name: { zh: '伦敦', en: 'London' } },
  { id: 'Europe/Paris', name: { zh: '巴黎', en: 'Paris' } },
  { id: 'Europe/Moscow', name: { zh: '莫斯科', en: 'Moscow' } },
  { id: 'America/New_York', name: { zh: '纽约', en: 'New York' } },
  { id: 'America/Chicago', name: { zh: '芝加哥', en: 'Chicago' } },
  { id: 'America/Denver', name: { zh: '丹佛', en: 'Denver' } },
  { id: 'America/Los_Angeles', name: { zh: '洛杉矶', en: 'Los Angeles' } },
  { id: 'Pacific/Auckland', name: { zh: '奥克兰', en: 'Auckland' } },
  { id: 'UTC', name: { zh: 'UTC（协调世界时）', en: 'UTC (Coordinated Universal Time)' } },
];

export const AVATAR_COLORS = ['#f97316', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** WMO 天气代码 → emoji（描述文案按语言放在 i18n 字典的 wmo_* 键中） */
export const WMO_EMOJI: Record<number, string> = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️',
  56: '🌧️', 57: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  66: '🌧️', 67: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '🌧️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

export function hashIndex(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function avatarColor(key: string): string {
  return AVATAR_COLORS[hashIndex(key, AVATAR_COLORS.length)];
}

export function faviconUrl(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${hostOf(url)}&sz=32`;
}

export function normalizeUrl(input: string): string | null {
  let u = input.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    return new URL(u).href;
  } catch {
    return null;
  }
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function formatCount(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    const rounded = Math.round(k * 10) / 10;
    return `${rounded.toFixed(1)}k`;
  }
  return String(value);
}

export async function fetchJSON<T = unknown>(url: string, timeout = 6500): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
