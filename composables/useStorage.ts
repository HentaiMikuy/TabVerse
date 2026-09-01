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
export const K_RSS = 'tv_rss';
export const K_RSS_CACHE = 'tv_rss_cache';
export const K_RSS_REMOVED = 'tv_rss_removed'; // 用户主动删除过的默认源 URL

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
