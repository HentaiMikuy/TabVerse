/* 存储封装：优先 chrome.storage.sync，非扩展环境（预览/开发）回退 localStorage。
   chrome.storage.sync 有硬配额（单条 8KB、总量 100KB、每分钟 120 次写入），必须省着用，
   因此两个存储区职责分明：
   - sync：只放「用户数据」——设置、待办、快捷访问、订阅源地址，跨设备同步才有意义；
   - local：缓存（RSS 文章 / 天气 / GitHub）、设备态（当前标签、副栏视图、书签视图）、
     敏感数据（GitHub 令牌）、大文件（背景、图标缓存），本机存即可，不占同步配额。
   历史上误放进 sync 的键由 migrateStorageLayout() 一次性搬回 local。 */

/* ---------- sync：用户数据（跨设备） ---------- */
export const K_LINKS = 'tv_links';
export const K_TODOS = 'tv_todos';
export const K_SETTINGS = 'tv_settings';
export const K_RSS = 'tv_rss';
export const K_RSS_REMOVED = 'tv_rss_removed'; // 用户主动删除过的默认源 URL（订阅配置的一部分）

/* ---------- local：缓存 / 设备态 / 敏感 / 大文件 ---------- */
export const K_WEATHER = 'tv_weather_cache'; // 天气数据缓存（城市本身在 settings.city，随设置同步）
export const K_TAB = 'tv_active_tab'; // 当前所在标签页（设备态）
export const K_SUBVIEW = 'tv_subview'; // 副栏视图（设备态）
export const K_BM_VIEW = 'tv_bm_view'; // 书签面板视图偏好 dir / split（设备态）
export const K_GH_USER = 'tv_gh_user'; // 记住的 GitHub 登录名（换设备重新登录即可，不同步）
export const K_GH_PROFILE = 'tv_gh_profile_cache';
export const K_GH_REPOS = 'tv_gh_repos_cache';
export const K_GH_RATE_LIMIT = 'tv_gh_rate_limit'; // core API 限流重置时间（ms）
export const K_GH_SEARCH_RATE_LIMIT = 'tv_gh_search_rate_limit'; // search API 限流重置时间（ms）
export const K_FAVICONS = 'tv_favicons'; // 站点图标缓存
export const K_RSS_READ = 'tv_rss_read'; // RSS 已读文章链接（量大）
export const K_GH_TOKEN = 'tv_gh_token'; // GitHub OAuth 访问令牌（敏感）
export const K_RSS_CACHE = 'tv_rss_cache'; // RSS 文章缓存（订阅地址在 tv_rss，随用户数据同步）
export const K_BG_URL = 'tv_bg_url'; // 自定义背景地址（图片/视频可能很大）

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
  /* Vue reactive Proxy 传给 chrome.storage 会被序列化成 {0:…} 普通对象而非数组，
     先 JSON 归一化成纯数据，保证存入的形状与字面量一致 */
  const plain = JSON.parse(JSON.stringify(val ?? null)) as unknown;
  if (hasChromeStorage) {
    try {
      await chrome.storage.sync.set({ [key]: plain });
      return;
    } catch {
      /* 落到 localStorage */
    }
  }
  try {
    localStorage.setItem(key, JSON.stringify(plain));
  } catch {
    /* 忽略 */
  }
}

/** 兼容旧数据：修复前的 reactive 数组曾被序列化成 {0:…} 形状，读出时恢复为数组 */
export function asArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val && typeof val === 'object') return Object.values(val) as T[];
  return [];
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

/* ---------- 一次性迁移：把历史上误放进 sync 的缓存 / 设备态搬到 local ---------- */

/** 这些键过去走 storeGet/storeSet（sync），现在改为 local；迁移后从 sync 删除以回收同步配额 */
const MOVED_TO_LOCAL: string[] = [
  K_WEATHER,
  K_TAB,
  K_SUBVIEW,
  K_BM_VIEW,
  K_GH_USER,
  K_GH_PROFILE,
  K_GH_REPOS,
  K_GH_RATE_LIMIT,
  K_GH_SEARCH_RATE_LIMIT,
  K_RSS_CACHE,
];

/**
 * 应用挂载前调用一次：sync 里的旧缓存 / 设备态搬到 local，再清掉 sync 残留。
 * 先写 local 成功后才删 sync，且不覆盖 local 中已有的新值；任何异常都静默忽略
 * （迁移失败最多是缓存重新拉取一次，不影响用户数据本身）。
 */
export async function migrateStorageLayout(): Promise<void> {
  if (!hasChromeStorage || !chrome.storage?.local) return;
  try {
    const fromSync = await chrome.storage.sync.get(MOVED_TO_LOCAL);
    const present = MOVED_TO_LOCAL.filter((k) => k in fromSync);
    if (!present.length) return;
    const inLocal = await chrome.storage.local.get(present);
    const toLocal: Record<string, unknown> = {};
    for (const k of present) {
      if (!(k in inLocal)) toLocal[k] = fromSync[k];
    }
    if (Object.keys(toLocal).length) await chrome.storage.local.set(toLocal);
    await chrome.storage.sync.remove(present);
  } catch {
    /* 忽略：下次打开新标签页会重试 */
  }
}
