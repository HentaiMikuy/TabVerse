<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { hostOf } from '../utils/common';
import { useI18n } from '../utils/i18n';
import { useToast } from '../composables/useToast';
import { K_BM_VIEW, storeGet, storeSet } from '../composables/useStorage';
import SiteIcon from './SiteIcon.vue';

interface BmNode {
  id: string;
  title: string;
  url?: string;
  children?: BmNode[];
  bookmarkCount: number;
  addedAt?: number; // 书签的添加时间（ms），供「最近添加」排序
}

const BOOKMARK_PAGE = 60;

/** Chrome 内置文件夹 id → i18n 键（本地化名称） */
const BUILTIN_FOLDER_KEYS: Record<string, string> = {
  '1': 'bm.builtin.bookmarks',
  '2': 'bm.builtin.other',
  '3': 'bm.builtin.mobile',
  menu________: 'bm.builtin.menu',
  toolbar_____: 'bm.builtin.toolbar',
  unfiled_____: 'bm.builtin.unfiled',
  mobile______: 'bm.builtin.mobile2',
};

const { toast } = useToast();
const { t } = useI18n();

const tree = ref<BmNode[]>([]);
const total = ref(0);
const path = ref<string[]>([]); // 当前所在文件夹的 id 路径
const shown = ref(0); // 当前目录/搜索结果已展示的条数
const kw = ref('');
/** 视图偏好初始值：同步读 localStorage 避免首帧闪烁，挂载后再用同步存储校正 */
function initialViewMode(): 'dir' | 'split' {
  try {
    const v = localStorage.getItem(K_BM_VIEW);
    if (v === 'dir' || v === 'split') return v;
  } catch {
    /* 忽略 */
  }
  return 'dir';
}
const viewMode = ref<'dir' | 'split'>(initialViewMode());
const expandedIds = ref<Set<string>>(new Set()); // 双栏视图左侧树的展开文件夹（默认展开顶层）
const selectedId = ref<string>(''); // 双栏视图当前选中的文件夹
const sortMode = ref<'default' | 'recent'>('default'); // 右栏书签排序：默认树序 / 最近添加

const hasApi = typeof chrome !== 'undefined' && !!chrome.bookmarks?.getTree;

function normalizeNodes(nodes: chrome.bookmarks.BookmarkTreeNode[]): BmNode[] {
  const out: BmNode[] = [];
  for (const n of nodes || []) {
    if (n.url) {
      out.push({ id: String(n.id), title: n.title || '', url: n.url, bookmarkCount: 1, addedAt: n.dateAdded || 0 });
      continue;
    }
    if (!n.children) continue;
    const children = normalizeNodes(n.children);
    const bookmarkCount = children.reduce((sum, c) => sum + c.bookmarkCount, 0);
    if (!bookmarkCount) continue;
    const id = String(n.id);
    out.push({ id, title: n.title || t(BUILTIN_FOLDER_KEYS[id]) || t('bm.unnamed'), children, bookmarkCount });
  }
  return out;
}

/** 拆掉浏览器书签树最外层的无名虚拟根（Chrome id=0 / Firefox root________ 等） */
function unwrapRoots(nodes: chrome.bookmarks.BookmarkTreeNode[]): chrome.bookmarks.BookmarkTreeNode[] {
  if (nodes.length === 1 && !nodes[0].url && nodes[0].children && !nodes[0].title) {
    return nodes[0].children!;
  }
  return nodes;
}

function countBookmarks(nodes: BmNode[]): number {
  return (nodes || []).reduce((sum, n) => sum + (n.bookmarkCount || (n.url ? 1 : 0)), 0);
}

function matchesKw(n: BmNode, k: string): boolean {
  if ((n.title || '').toLowerCase().includes(k)) return true;
  if (n.url && n.url.toLowerCase().includes(k)) return true;
  return false;
}

function filterTree(nodes: BmNode[], k: string): BmNode[] {
  if (!k) return nodes;
  const out: BmNode[] = [];
  for (const n of nodes) {
    if (n.url) {
      if (matchesKw(n, k)) out.push(n);
      continue;
    }
    const selfMatch = matchesKw(n, k);
    const kids = filterTree(n.children || [], k);
    if (!selfMatch && !kids.length) continue;
    out.push({
      ...n,
      children: kids.length ? kids : n.children,
      bookmarkCount: kids.length ? countBookmarks(kids) : n.bookmarkCount,
    });
  }
  return out;
}

interface Matched {
  title: string;
  url: string;
  path: string;
}

function collectMatched(nodes: BmNode[], prefix: string[], out: Matched[] = []): Matched[] {
  for (const n of nodes || []) {
    if (n.url) out.push({ title: n.title, url: n.url, path: prefix.join(' / ') });
    else collectMatched(n.children || [], prefix.concat(n.title), out);
  }
  return out;
}

const searching = computed(() => !!kw.value.trim());
const trail = computed(() => {
  const t: BmNode[] = [];
  let level = tree.value;
  for (const id of path.value) {
    const found = (level || []).find((n) => !n.url && n.id === id);
    if (!found) break;
    t.push(found);
    level = found.children || [];
  }
  return t;
});
const level = computed(() => (trail.value.length ? trail.value[trail.value.length - 1].children || [] : tree.value));
const folders = computed(() => level.value.filter((n) => !n.url));
const levelLinks = computed(() => level.value.filter((n) => n.url));
const levelAll = computed(() => folders.value.concat(levelLinks.value));

const matched = computed(() => (searching.value ? collectMatched(filterTree(tree.value, kw.value.trim().toLowerCase()), []) : []));

const limit = computed(() => shown.value || BOOKMARK_PAGE);
const visibleLevel = computed(() => levelAll.value.slice(0, limit.value));
const visibleMatched = computed(() => matched.value.slice(0, limit.value));

/* 双栏视图：左侧整棵目录树（可展开折叠），右侧展示选中文件夹的内容 */
interface PaneRow {
  kind: 'folder' | 'link';
  node: BmNode;
}

function findFolder(nodes: BmNode[], id: string): BmNode | null {
  for (const n of nodes || []) {
    if (n.url) continue;
    if (n.id === id) return n;
    const found = findFolder(n.children || [], id);
    if (found) return found;
  }
  return null;
}

/** 返回 id 对应文件夹的祖先链（不含自身），选中时用它自动展开祖先 */
function folderChain(nodes: BmNode[], id: string, trail: BmNode[] = []): BmNode[] | null {
  for (const n of nodes || []) {
    if (n.url) continue;
    if (n.id === id) return trail;
    const r = folderChain(n.children || [], id, [...trail, n]);
    if (r) return r;
  }
  return null;
}

/** 左侧树可见行：按展开状态深度优先遍历，只包含文件夹 */
const treeRows = computed(() => {
  const out: { node: BmNode; depth: number }[] = [];
  const walk = (nodes: BmNode[], depth: number) => {
    for (const n of nodes || []) {
      if (n.url) continue;
      out.push({ node: n, depth });
      if (expandedIds.value.has(n.id)) walk(n.children || [], depth + 1);
    }
  };
  walk(tree.value, 0);
  return out;
});

const selectedFolder = computed<BmNode | null>(() =>
  selectedId.value ? findFolder(tree.value, selectedId.value) : null
);
/** 右侧内容：选中文件夹的直接子级，文件夹在前、书签在后；「最近添加」时书签按时间倒序 */
const paneRows = computed<PaneRow[]>(() => {
  const kids = selectedFolder.value?.children || [];
  const links = kids.filter((n) => n.url);
  if (sortMode.value === 'recent') {
    links.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  return kids
    .filter((n) => !n.url)
    .map((n): PaneRow => ({ kind: 'folder', node: n }))
    .concat(links.map((n): PaneRow => ({ kind: 'link', node: n })));
});
const visiblePaneRows = computed(() => paneRows.value.slice(0, limit.value));

function toggleTree(node: BmNode) {
  const next = new Set(expandedIds.value);
  if (next.has(node.id)) next.delete(node.id);
  else next.add(node.id);
  expandedIds.value = next;
}

function selectFolder(id: string) {
  selectedId.value = id;
  shown.value = 0;
  // 选中即展开其祖先链，保证节点在左侧树中可见
  const chain = folderChain(tree.value, id);
  if (chain?.length) {
    const next = new Set(expandedIds.value);
    for (const a of chain) next.add(a.id);
    expandedIds.value = next;
  }
}

const footText = computed(() => {
  if (!tree.value.length) return '';
  if (searching.value) return matched.value.length ? t('bm.matchFoot', { n: matched.value.length }) : '';
  if (viewMode.value === 'split') return t('bm.totalFoot', { n: total.value });
  const parts: string[] = [];
  if (folders.value.length) parts.push(t('bm.folderFoot', { n: folders.value.length }));
  parts.push(t('bm.linkFoot', { n: levelLinks.value.length }));
  return parts.join(' · ') + (trail.value.length ? '' : ` · ${t('bm.totalFoot', { n: total.value })}`);
});

watch(kw, () => (shown.value = 0));
watch(path, () => (shown.value = 0), { deep: true });
watch(viewMode, (v) => {
  shown.value = 0;
  // 持久化视图偏好（localStorage 同步写供下次首帧直读，sync 存储跨设备）
  try {
    localStorage.setItem(K_BM_VIEW, v);
  } catch {
    /* 忽略 */
  }
  void storeSet(K_BM_VIEW, v);
  // 切到双栏时若还没有选中文件夹，默认选中第一个顶层文件夹
  if (viewMode.value === 'split' && !selectedId.value && tree.value.length) {
    selectFolder(tree.value[0].id);
  }
});

function enterFolder(node: BmNode) {
  path.value.push(node.id);
}
function gotoCrumb(index: number) {
  path.value = path.value.slice(0, index);
}
function goBack() {
  path.value = path.value.slice(0, -1);
}
function showMore() {
  shown.value = limit.value + BOOKMARK_PAGE;
}
function openLink(url: string) {
  location.href = url;
}

async function loadBookmarks() {
  if (!hasApi) return;
  try {
    const raw = await chrome.bookmarks.getTree();
    tree.value = normalizeNodes(unwrapRoots(raw));
    total.value = countBookmarks(tree.value);
    // 双栏视图默认展开顶层文件夹并选中第一个（通常是书签栏）
    expandedIds.value = new Set(tree.value.map((n) => n.id));
    if (tree.value.length) selectFolder(tree.value[0].id);
  } catch (e) {
    tree.value = [];
    total.value = 0;
    toast(t('bm.loadFailed', { msg: (e as Error).message }));
  }
}

/** 挂载后异步校正视图偏好：以 chrome.storage.sync（可跨设备同步）为准 */
async function loadViewPref() {
  const saved = await storeGet<'dir' | 'split' | null>(K_BM_VIEW, null);
  if (saved === 'dir' || saved === 'split') viewMode.value = saved;
}

onMounted(() => {
  void loadBookmarks();
  void loadViewPref();
});
</script>

<template>
  <div class="card bookmarks-card">
    <div class="card-head">
      <div class="head-text">
        <h2>{{ t('bm.title') }}</h2>
        <div class="card-sub">{{ t('bm.sub') }}</div>
      </div>
      <button
        class="icon-btn"
        :title="viewMode === 'dir' ? t('bm.toSplit') : t('bm.toDir')"
        @click="viewMode = viewMode === 'dir' ? 'split' : 'dir'"
      >
        <svg v-if="viewMode === 'dir'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M12 3v18" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      </button>
    </div>
    <input v-model="kw" class="line-input" type="text" :placeholder="t('bm.searchPlaceholder')" autocomplete="off" />

    <div v-if="!searching && tree.length && viewMode === 'dir'" class="bm-bar">
      <button v-if="trail.length" class="bm-back" :title="t('bm.back')" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <span class="bm-crumb" :class="{ current: !trail.length }" :title="t('bm.all')" @click="trail.length && gotoCrumb(0)">{{ t('bm.all') }}</span>
      <template v-for="(folder, i) in trail" :key="folder.id">
        <span class="bm-crumb-sep">›</span>
        <span class="bm-crumb" :class="{ current: i === trail.length - 1 }" :title="folder.title" @click="i < trail.length - 1 && gotoCrumb(i + 1)">{{ folder.title }}</span>
      </template>
    </div>

    <!-- 双栏视图：左侧目录树 + 右侧书签 -->
    <div v-if="viewMode === 'split' && !searching && tree.length" class="bm-split">
      <div class="bm-split-tree">
        <div
          v-for="row in treeRows"
          :key="row.node.id"
          class="bm-row bm-folder-row bm-tree-row"
          :class="{ active: row.node.id === selectedId }"
          :style="{ paddingLeft: 10 + row.depth * 14 + 'px' }"
          :title="t('bm.count', { n: row.node.bookmarkCount })"
          @click="selectFolder(row.node.id)"
        >
          <span
            v-if="row.node.children?.length"
            class="bm-enter bm-caret"
            :class="{ collapsed: !expandedIds.has(row.node.id) }"
            @click.stop="toggleTree(row.node)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
          <span v-else class="bm-enter"></span>
          <span class="bm-folder-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </span>
          <span class="bm-title">{{ row.node.title }}</span>
          <span class="bm-folder-count">{{ row.node.bookmarkCount }}</span>
        </div>
        <div v-if="!treeRows.length" class="bm-empty">{{ t('bm.noFolders') }}</div>
      </div>
      <div class="bm-split-pane">
        <div class="bm-split-head">
          <span class="bm-split-title">{{ selectedFolder?.title || t('bm.all') }}</span>
          <select v-model="sortMode" class="bm-sort" :aria-label="t('bm.sortLabel')">
            <option value="default">{{ t('bm.sortDefault') }}</option>
            <option value="recent">{{ t('bm.sortRecent') }}</option>
          </select>
          <span class="bm-split-count">{{ t('bm.count', { n: selectedFolder ? selectedFolder.bookmarkCount : total }) }}</span>
        </div>
        <ul class="bm-split-list">
          <li v-if="!paneRows.length" class="bm-empty">{{ t('bm.emptyFolder') }}</li>
          <template v-else>
            <template v-for="row in visiblePaneRows" :key="row.node.id">
              <li
                v-if="row.kind === 'folder'"
                class="bm-row bm-folder-row"
                @click="selectFolder(row.node.id)"
              >
                <span class="bm-folder-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                </span>
                <span class="bm-title">{{ row.node.title }}</span>
                <span class="bm-folder-count">{{ row.node.bookmarkCount }}</span>
                <span class="bm-enter">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </span>
              </li>
              <li
                v-else
                class="bm-row bm-link"
                :title="row.node.url"
                @click="openLink(row.node.url!)"
              >
                <SiteIcon :url="row.node.url!" :name="row.node.title" />
                <span class="bm-title">{{ row.node.title || hostOf(row.node.url!) }}</span>
                <span class="bm-domain">{{ hostOf(row.node.url!) }}</span>
              </li>
            </template>
            <li v-if="paneRows.length > visiblePaneRows.length" class="bm-more" @click="showMore">
              {{ t('bm.showMore', { n: paneRows.length - visiblePaneRows.length }) }}
            </li>
          </template>
        </ul>
      </div>
    </div>

    <ul v-else class="bm-list">
      <li v-if="!tree.length" class="bm-empty">
        {{ hasApi ? t('bm.noBookmarks') : t('bm.noApi') }}
      </li>
      <li v-else-if="searching && !matched.length" class="bm-empty">{{ t('bm.noMatch') }}</li>
      <li v-else-if="!searching && viewMode === 'dir' && !levelAll.length" class="bm-empty">{{ t('bm.emptyFolder') }}</li>

      <template v-else-if="searching">
        <li
          v-for="m in visibleMatched"
          :key="m.url"
          class="bm-row bm-link"
          :title="(m.path ? m.path + '\n' : '') + m.url"
          @click="openLink(m.url)"
        >
          <SiteIcon :url="m.url" :name="m.title" />
          <span class="bm-title">{{ m.title || hostOf(m.url) }}</span>
          <span class="bm-domain">{{ m.path ? `${m.path} · ${hostOf(m.url)}` : hostOf(m.url) }}</span>
        </li>
        <li v-if="matched.length > visibleMatched.length" class="bm-more" @click="showMore">
          {{ t('bm.showMore', { n: matched.length - visibleMatched.length }) }}
        </li>
      </template>

      <template v-else>
        <template v-for="n in visibleLevel" :key="n.id">
          <li v-if="n.url" class="bm-row bm-link" :title="n.url" @click="openLink(n.url)">
            <SiteIcon :url="n.url" :name="n.title" />
            <span class="bm-title">{{ n.title || hostOf(n.url) }}</span>
            <span class="bm-domain">{{ hostOf(n.url) }}</span>
          </li>
          <li v-else class="bm-row bm-folder-row" @click="enterFolder(n)">
            <span class="bm-folder-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </span>
            <span class="bm-title">{{ n.title }}</span>
            <span class="bm-folder-count">{{ n.bookmarkCount }}</span>
            <span class="bm-enter">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </span>
          </li>
        </template>
        <li v-if="levelAll.length > visibleLevel.length" class="bm-more" @click="showMore">
          {{ t('bm.showMore', { n: levelAll.length - visibleLevel.length }) }}
        </li>
      </template>
    </ul>

    <div class="list-foot">{{ footText }}</div>
  </div>
</template>
