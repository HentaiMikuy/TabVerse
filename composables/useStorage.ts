/* 存储封装：优先 chrome.storage.sync，非扩展环境（预览/开发）回退 localStorage */

export const K_LINKS = 'tv_links';
export const K_TODOS = 'tv_todos';
export const K_SETTINGS = 'tv_settings';
export const K_WEATHER = 'tv_weather_cache';
export const K_TAB = 'tv_active_tab';
export const K_SUBVIEW = 'tv_subview';
export const K_GH_USER = 'tv_gh_user';
export const K_GH_PROFILE = 'tv_gh_profile_cache';
export const K_GH_REPOS = 'tv_gh_repos_cache';
export const K_GH_RATE_LIMIT = 'tv_gh_rate_limit'; // core API 限流重置时间（ms）
export const K_GH_SEARCH_RATE_LIMIT = 'tv_gh_search_rate_limit'; // search API 限流重置时间（ms）
export const K_FAVICONS = 'tv_favicons'; // 站点图标缓存（存 chrome.storage.local，容量较大）
export const K_BM_VIEW = 'tv_bm_view'; // 书签面板视图偏好（dir / split）
export const K_RSS_READ = 'tv_rss_read'; // RSS 已读文章链接（存 chrome.storage.local，量大）
export const K_GH_TOKEN = 'tv_gh_token'; // GitHub OAuth 访问令牌（存 chrome.storage.local，敏感）
export const K_RSS = 'tv_rss';
export const K_RSS_CACHE = 'tv_rss_cache';
export const K_RSS_REMOVED = 'tv_rss_removed'; // 用户主动删除过的默认源 URL
export const K_BG_URL = 'tv_bg_url'; // 自定义背景地址（存 chrome.storage.local，图片/视频可能很大）

const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage?.sync;

export async function storeGet<T>(key: string, def: T): Promise<T> {
  if (hasChromeStorage) {
    try {
      const res = await chrome.storage.sync.get(key);
      return key in res ? (res[key] as T) : def;
    } catch {
      /* 落到 localStorage */
    }
  }
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? def : (JSON.parse(raw) as T);
  } catch {
    return def;
  }
}

export async function storeRemove(key: string): Promise<void> {
  if (hasChromeStorage) {
    try {
      await chrome.storage.sync.remove(key);
      return;
    } catch {
      /* 落到 localStorage */
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
}

export async function storeSet(key: string, val: unknown): Promise<void> {
  if (hasChromeStorage) {
    try {
      await chrome.storage.sync.set({ [key]: val });
      return;
    } catch {
      /* 落到 localStorage */
    }
  }
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* 忽略 */
  }
}

/* ---------- chrome.storage.local（大容量持久化：图标缓存、RSS 已读、令牌等） ---------- */

export async function storeLocalGet<T>(key: string, def: T): Promise<T> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const res = await chrome.storage.local.get(key);
      return key in res ? (res[key] as T) : def;
    } catch {
      /* 落到 localStorage */
    }
  }
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? def : (JSON.parse(raw) as T);
  } catch {
    return def;
  }
}

export async function storeLocalSet(key: string, val: unknown): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({ [key]: val });
      return;
    } catch {
      /* 落到 localStorage */
    }
  }
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* 忽略 */
  }
}

export async function storeLocalRemove(key: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      await chrome.storage.local.remove(key);
      return;
    } catch {
      /* 落到 localStorage */
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
}

/** 写入 chrome.storage.local 并返回是否成功（背景等大文件配额不足时能提示用户） */
export async function storeLocalSetReport(key: string, val: unknown): Promise<boolean> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({ [key]: val });
      return true;
    } catch {
      /* 落到 localStorage */
    }
  }
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}
