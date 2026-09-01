/* 站点图标缓存：避免每次渲染书签列表都向 Google favicon 服务发重复请求。
   两级缓存：模块内存 Map 优先（同页面秒显），chrome.storage.local 持久化（跨标签页），
   超出上限按最旧淘汰。 */

import { K_FAVICONS } from './useStorage';

const MAX_ENTRIES = 500;
const FETCH_TIMEOUT_MS = 8_000;

export function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

const memCache = new Map<string, string>(); // host -> dataURL
const pending = new Map<string, Promise<string | null>>(); // 同一域名并发请求去重
let storeLoaded = false;

function storageGet(): Promise<Record<string, string>> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local.get(K_FAVICONS).then((res) => (res[K_FAVICONS] as Record<string, string>) || {});
  }
  try {
    return Promise.resolve(JSON.parse(localStorage.getItem(K_FAVICONS) || '{}'));
  } catch {
    return Promise.resolve({});
  }
}

function storageSet(obj: Record<string, string>): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local.set({ [K_FAVICONS]: obj });
  }
  try {
    localStorage.setItem(K_FAVICONS, JSON.stringify(obj));
  } catch {
    /* 存储满等场景忽略，内存缓存不受影响 */
  }
  return Promise.resolve();
}

/** 惰性把持久化缓存灌入内存（只读一次，之后内存为准） */
async function ensureStoreLoaded(): Promise<void> {
  if (storeLoaded) return;
  const store = await storageGet();
  for (const [k, v] of Object.entries(store)) {
    if (memCache.size >= MAX_ENTRIES) break;
    memCache.set(k, v);
  }
  storeLoaded = true;
}

function trimCache() {
  while (memCache.size > MAX_ENTRIES) {
    const oldest = memCache.keys().next().value;
    if (oldest === undefined) break;
    memCache.delete(oldest);
  }
}

/** 串行化写入，避免并发写入互相覆盖（快照在入队时生成，后写的快照必包含先写的条目） */
let persistChain: Promise<void> = Promise.resolve();
function persist() {
  const snapshot: Record<string, string> = {};
  for (const [k, v] of memCache) snapshot[k] = v;
  persistChain = persistChain.then(() => storageSet(snapshot));
  return persistChain;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 取某域名的图标 dataURL；失败返回 null（调用方回退直连或字母头像） */
export async function loadFavicon(host: string): Promise<string | null> {
  if (!host) return null;
  const cached = memCache.get(host);
  if (cached) return cached;
  const inflight = pending.get(host);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      await ensureStoreLoaded();
      const fromStore = memCache.get(host);
      if (fromStore) return fromStore;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(faviconUrl(host), { signal: ctrl.signal });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob.size) return null;
        const dataUrl = await blobToDataUrl(blob);
        if (!dataUrl) return null;
        memCache.set(host, dataUrl);
        trimCache();
        void persist();
        return dataUrl;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    } finally {
      pending.delete(host);
    }
  })();

  pending.set(host, task);
  return task;
}
