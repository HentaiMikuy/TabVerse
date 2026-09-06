import { onMounted, reactive, readonly, ref, type Ref } from 'vue';
import { useI18n } from '../utils/i18n';
import { K_RSS, K_RSS_READ, K_RSS_REMOVED, storeGet, storeLocalGet, storeLocalSet, storeSet } from './useStorage';

/* ---------------- RSS 订阅（无需后端，直接用浏览器 fetch 解析 XML/Atom） ---------------- */

export interface RssItem {
  id: string;
  title: string;
  link: string;
  description: string;
  author: string;
  publishedAt: string; // ISO
}

export interface RssFeed {
  id: string;
  title: string;
  url: string;
}

export const DEFAULT_FEEDS: RssFeed[] = [
  { id: 'hn', title: 'Hacker News', url: 'https://hnrss.org/best' },
  { id: 'google-research', title: 'Google Research Blog', url: 'https://research.google/blog/rss/' },
  { id: 'portswigger', title: 'PortSwigger Research', url: 'https://portswigger.net/research/rss' },
  { id: 'github-blog', title: 'GitHub Blog', url: 'https://github.blog/feed/' },
  { id: 'krebs', title: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
  { id: 'schneier', title: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom/' },
  { id: 'ars', title: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { id: 'verge', title: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'arxiv-ml', title: 'arXiv 机器学习', url: 'https://export.arxiv.org/rss/cs.LG' },
  { id: 'mit-ai', title: 'MIT Tech Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function pickString(node: Element | null | undefined, tag: string): string {
  if (!node) return '';
  const el = node.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() || '';
}

function itemFromAtom(entry: Element, fallbackTitle: string): RssItem | null {
  const title = entry.getElementsByTagName('title')[0]?.textContent?.trim() || '';
  // Blogger 等源会在条目里放多个 link：第一个常是 rel="replies" 的评论 feed，
  // 必须优先取 rel="alternate" 的文章链接，否则点开的会是 XML 而不是文章页
  const links = Array.from(entry.getElementsByTagName('link'));
  const alt = links.find((l) => l.getAttribute('rel') === 'alternate');
  const href = alt?.getAttribute('href') || links[0]?.getAttribute('href') || '';
  const summary = entry.getElementsByTagName('summary')[0]?.textContent?.trim() || '';
  const published = entry.getElementsByTagName('updated')[0]?.textContent?.trim() || '';
  const author = entry.getElementsByTagName('name')[0]?.textContent?.trim() || '';
  if (!title && !href) return null;
  return {
    id: `${title}|${href}|${published}`,
    title: title || fallbackTitle,
    link: href,
    description: summary.replace(/<[^>]+>/g, ' ').slice(0, 220),
    author,
    publishedAt: published,
  };
}

function itemFromRss(item: Element, fallbackTitle: string): RssItem | null {
  const title = item.getElementsByTagName('title')[0]?.textContent?.trim() || '';
  const link = item.getElementsByTagName('link')[0]?.textContent?.trim() || '';
  const description = item.getElementsByTagName('description')[0]?.textContent?.trim() || '';
  const author = item.getElementsByTagName('author')[0]?.textContent?.trim() || '';
  const published = item.getElementsByTagName('pubDate')[0]?.textContent?.trim() || '';
  if (!title && !link) return null;
  const cleanDesc = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    id: `${title}|${link}|${published}`,
    title: title || fallbackTitle,
    link,
    description: cleanDesc.slice(0, 220),
    author,
    publishedAt: published,
  };
}

function parseFeed(xmlText: string, fallbackTitle: string): { title: string; items: RssItem[] } {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const isAtom = !!doc.querySelector('feed');
  const title =
    doc.querySelector('feed > title, channel > title')?.textContent?.trim() || fallbackTitle;

  let items: RssItem[] = [];
  if (isAtom) {
    const entries = Array.from(doc.querySelectorAll('entry'));
    items = entries
      .map((e) => itemFromAtom(e, fallbackTitle))
      .filter((x): x is RssItem => !!x);
  } else {
    const channelItems = Array.from(doc.querySelectorAll('item'));
    items = channelItems
      .map((e) => itemFromRss(e, fallbackTitle))
      .filter((x): x is RssItem => !!x);
  }

  items = items
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 20);

  return { title, items };
}

/** 抓取一个地址，带独立超时；on 开头的是 CORS 直连，其余是公开代理回退 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抓取订阅源内容。有了 host_permissions 后直连即可绕过 CORS，
 * 优先直连（最快最稳），仅在源站拒绝时才回退公共代理。
 * 每个都带超时，避免个别源卡死整段加载。
 */
async function fetchFeedText(url: string): Promise<string> {
  const { t } = useI18n();
  const enc = encodeURIComponent(url);
  const attempts: { name: string; run: () => Promise<string> }[] = [
    { name: 'direct', run: () => fetchWithTimeout(url, 12000) },
    { name: 'corsproxy', run: () => fetchWithTimeout(`https://corsproxy.io/?url=${enc}`, 12000) },
    { name: 'allorigins', run: () => fetchWithTimeout(`https://api.allorigins.win/raw?url=${enc}`, 14000) },
  ];

  let lastError = '';
  for (const attempt of attempts) {
    try {
      const text = await attempt.run();
      // 个别代理会把错误以 200 + JSON/文本返回（如 corsproxy.io 缺 API key），
      // 非 XML 内容视为本次尝试失败，继续回退到下一个代理
      if (!text.trimStart().startsWith('<')) {
        lastError = `${attempt.name} ${t('rss.err.nonXml')}`;
        continue;
      }
      return text;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = `${attempt.name} ${t('rss.err.timeout')}`;
      } else {
        lastError = err instanceof Error ? err.message : String(err);
      }
      // 继续尝试下一个
    }
  }
  throw new Error(t('rss.err.cannotRead', { err: lastError || t('rss.err.network') }));
}

/** 每个源最近一次成功抓取的时间戳，用于最小化请求、防止被源站限流 */
const lastFetchedAt = new Map<string, number>();
const FRESH_MS = 5 * 60 * 1000; // 5 分钟内不重复拉取

/** 在内存里缓存每个源最近一次解析结果，避免重复往返、切回时秒显 */
const memoryCache = new Map<string, { title: string; items: RssItem[] }>();

/* ---------------- 已读标记（reactive Set：存 chrome.storage.local，超量淘汰最早标记） ---------------- */

const RSS_READ_MAX = 5000;
const readLinks = reactive(new Set<string>());

async function loadReadLinks() {
  const list = await storeLocalGet<string[]>(K_RSS_READ, []);
  for (const l of list) readLinks.add(l);
}

function persistReadLinks() {
  while (readLinks.size > RSS_READ_MAX) {
    const oldest = readLinks.values().next().value;
    if (oldest === undefined) break;
    readLinks.delete(oldest);
  }
  void storeLocalSet(K_RSS_READ, [...readLinks]);
}

/** 文章是否已读（readLinks 为 reactive Set，模板调用可触发更新） */
function isRead(link: string): boolean {
  return !!link && readLinks.has(link);
}

function markRead(link: string) {
  if (!link || readLinks.has(link)) return;
  readLinks.add(link);
  persistReadLinks();
}

function markAllRead(items: readonly RssItem[]) {
  let changed = false;
  for (const it of items) {
    if (it.link && !readLinks.has(it.link)) {
      readLinks.add(it.link);
      changed = true;
    }
  }
  if (changed) persistReadLinks();
}

export function useRss() {
  const { t } = useI18n();
  const feeds = ref<RssFeed[]>([]);
  const activeFeedId = ref<string>('');
  const items = ref<RssItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let controller: AbortController | null = null;
  let requestVersion = 0;

  const activeFeed: Ref<RssFeed | null> = ref(null);

  interface PersistedCache {
    [url: string]: { title: string; items: RssItem[]; at: number };
  }
  let persisted: PersistedCache = {};

  async function loadPersistedCache() {
    persisted = (await storeGet<PersistedCache>(K_RSS_CACHE, {})) || {};
    // 恢复到内存缓存，便于页面打开即显
    for (const [url, entry] of Object.entries(persisted)) {
      if (entry?.items?.length) memoryCache.set(url, { title: entry.title, items: entry.items });
    }
  }

  function persistEntry(url: string, title: string, itemList: RssItem[]) {
    const entry = { title, items: itemList, at: Date.now() };
    persisted = { ...persisted, [url]: entry };
    memoryCache.set(url, { title, items: itemList });
    storeSet(K_RSS_CACHE, persisted);
  }

  async function loadFeeds() {
    await loadReadLinks();
    await loadPersistedCache();
    // 用户主动删除过的默认源 URL，迁移补源时不再加回
    const removedSet = new Set((await storeGet<string[]>(K_RSS_REMOVED, [])) || []);

    const stored = await storeGet<RssFeed[] | null>(K_RSS, null);
    if (Array.isArray(stored) && stored.length) {
      // 丢弃已停用/失效的旧默认源（用户自定义的保留）
      const BROKEN = [
        'www.ruanyifeng.com',
        'www.v2ex.com',
        'news.ycombinator.com',
        'blog.research.google', // 旧源 302 到 feedburner 的 http 地址，浏览器里已无法直连，新源见 DEFAULT_FEEDS
      ];
      const list = stored.filter((f) => !BROKEN.some((b) => f.url.includes(b)));
      if (!list.length) {
        feeds.value = DEFAULT_FEEDS.slice();
      } else {
        // 老用户迁移：新增的默认源按默认位置补入（用户主动删过的除外），
        // 其余条目保持存储中的顺序
        const have = new Set(list.map((f) => f.url));
        const merged: RssFeed[] = [];
        let si = 0;
        for (const def of DEFAULT_FEEDS) {
          // 先取出存储列表中排在该默认源之前、且非默认源的自定义源（保持相对顺序）
          while (si < list.length && !DEFAULT_FEEDS.some((d) => d.url === list[si].url)) {
            merged.push(list[si++]);
          }
          const hit = list.find((f) => f.url === def.url);
          if (hit) {
            merged.push(hit);
          } else if (!removedSet.has(def.url)) {
            merged.push({ ...def }); // 新默认源，插入默认位置
          }
        }
        while (si < list.length) merged.push(list[si++]);
        feeds.value = merged;
      }
      // 把清理/补齐后的列表写回，避免下次再读到坏源
      storeSet(K_RSS, feeds.value);
    } else {
      feeds.value = DEFAULT_FEEDS.slice();
    }
    // 预热：所有源并行拉取，切到任何源都尽量命中缓存/尽快就绪
    void Promise.allSettled(feeds.value.map((f) => refreshFeed(f)));
    if (!feeds.value.some((f) => f.id === activeFeedId.value)) {
      activeFeedId.value = feeds.value[0]?.id || '';
    }
  }

  async function refreshFeed(feed: RssFeed, force = false) {
    const cached = memoryCache.get(feed.url);
    // 有缓存先立即显示，再后台刷新
    if (cached && feed.id === activeFeedId.value) {
      feed.title = cached.title || feed.title;
      items.value = cached.items;
      loading.value = false;
      error.value = null;
    }

    // 5 分钟内的重复请求直接复用已有缓存，避免频繁访问被源站限流
    const lastAt = lastFetchedAt.get(feed.url) || 0;
    if (!force && Date.now() - lastAt < FRESH_MS) {
      lastFetchedAt.set(feed.url, Date.now());
      return;
    }

    try {
      const text = await fetchFeedText(feed.url);
      const parsed = parseFeed(text, feed.title);
      feed.title = parsed.title || feed.title;
      persistEntry(feed.url, feed.title, parsed.items);
      lastFetchedAt.set(feed.url, Date.now());
      if (feed.id === activeFeedId.value) {
        items.value = parsed.items;
        error.value = null;
        loading.value = false;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (feed.id === activeFeedId.value && !cached) {
        error.value = err instanceof Error ? err.message : t('rss.err.parse');
        items.value = [];
        loading.value = false;
      }
    }
  }

  async function refresh(force = false) {
    const feed = feeds.value.find((f) => f.id === activeFeedId.value);
    if (!feed) {
      items.value = [];
      error.value = null;
      return;
    }
    activeFeed.value = feed;

    const cached = memoryCache.get(feed.url);
    // 无缓存才显示加载态；有缓存则直接展示旧内容、后台更新
    loading.value = !cached;
    if (cached) {
      feed.title = cached.title || feed.title;
      items.value = cached.items;
      error.value = null;
    }
    await refreshFeed(feed, force);
  }

  function selectFeed(id: string) {
    if (id === activeFeedId.value) return;
    activeFeedId.value = id;
    void refresh();
  }

  async function addFeed(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return false;
    if (!/^https?:\/\//i.test(trimmed)) {
      error.value = t('rss.err.invalidUrl');
      return false;
    }
    const exists = feeds.value.some((f) => f.url === trimmed);
    if (exists) {
      const found = feeds.value.find((f) => f.url === trimmed);
      if (found) activeFeedId.value = found.id;
      await refresh();
      return true;
    }
    const newFeed: RssFeed = {
      id: 'feed-' + Date.now(),
      title: hostOf(trimmed),
      url: trimmed,
    };
    feeds.value = [...feeds.value, newFeed];
    activeFeedId.value = newFeed.id;
    storeSet(K_RSS, feeds.value);
    await refresh();
    return true;
  }

  async function removeFeed(id: string) {
    if (feeds.value.length <= 1) {
      error.value = t('rss.err.keepOne');
      return;
    }
    const target = feeds.value.find((f) => f.id === id);
    feeds.value = feeds.value.filter((f) => f.id !== id);
    storeSet(K_RSS, feeds.value);
    // 用户主动删掉的默认源记入黑名单，加载时的“补齐默认源”不会再把它加回
    if (target && DEFAULT_FEEDS.some((d) => d.url === target.url)) {
      const removed = new Set((await storeGet<string[]>(K_RSS_REMOVED, [])) || []);
      removed.add(target.url);
      storeSet(K_RSS_REMOVED, [...removed]);
    }
    if (activeFeedId.value === id) {
      activeFeedId.value = feeds.value[0].id;
      await refresh();
    }
  }

  /** 拖拽排序：把 fromId 源移动到 targetId 源所在位置（持久化到存储） */
  function moveFeed(fromId: string, targetId: string) {
    if (fromId === targetId) return;
    const from = feeds.value.findIndex((f) => f.id === fromId);
    const target = feeds.value.findIndex((f) => f.id === targetId);
    if (from < 0 || target < 0) return;
    const list = feeds.value.slice();
    const [moved] = list.splice(from, 1);
    // 移除后，目标下标在 from 之后时会左移一位
    const insertAt = from < target ? target - 1 : target;
    list.splice(insertAt, 0, moved);
    feeds.value = list;
    storeSet(K_RSS, feeds.value);
  }

  function resetError() {
    error.value = null;
  }

  onMounted(() => {
    void loadFeeds().then(() => refresh());
  });

  return {
    feeds: readonly(feeds),
    activeFeed: readonly(activeFeed),
    activeFeedId: readonly(activeFeedId),
    items: readonly(items),
    loading: readonly(loading),
    error: readonly(error),
    refresh,
    selectFeed,
    addFeed,
    removeFeed,
    moveFeed,
    resetError,
    isRead,
    markRead,
    markAllRead,
  };
}