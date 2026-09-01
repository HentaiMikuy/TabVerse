<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { hostOf } from '../utils/common';
import { useToast } from '../composables/useToast';
import SiteIcon from './SiteIcon.vue';

interface BmNode {
  id: string;
  title: string;
  url?: string;
  children?: BmNode[];
  bookmarkCount: number;
}

const BOOKMARK_PAGE = 60;

const BUILTIN_FOLDER_NAMES: Record<string, string> = {
  '1': '书签栏',
  '2': '其他书签',
  '3': '移动设备书签',
  menu________: '书签菜单',
  toolbar_____: '书签工具栏',
  unfiled_____: '其他书签',
  mobile______: '移动设备书签',
};

const { toast } = useToast();

const tree = ref<BmNode[]>([]);
const total = ref(0);
const path = ref<string[]>([]); // 当前所在文件夹的 id 路径
const shown = ref(0); // 当前目录/搜索结果已展示的条数
const kw = ref('');

const hasApi = typeof chrome !== 'undefined' && !!chrome.bookmarks?.getTree;

function normalizeNodes(nodes: chrome.bookmarks.BookmarkTreeNode[]): BmNode[] {
  const out: BmNode[] = [];
  for (const n of nodes || []) {
    if (n.url) {
      out.push({ id: String(n.id), title: n.title || '', url: n.url, bookmarkCount: 1 });
      continue;
    }
    if (!n.children) continue;
    const children = normalizeNodes(n.children);
    const bookmarkCount = children.reduce((sum, c) => sum + c.bookmarkCount, 0);
    if (!bookmarkCount) continue;
    const id = String(n.id);
    out.push({ id, title: n.title || BUILTIN_FOLDER_NAMES[id] || '未命名文件夹', children, bookmarkCount });
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

const badgeText = computed(() => (searching.value ? String(matched.value.length) : String(total.value)));

const footText = computed(() => {
  if (!tree.value.length) return '';
  if (searching.value) return matched.value.length ? `匹配 ${matched.value.length} 条书签 · 已搜索全部文件夹` : '';
  const parts: string[] = [];
  if (folders.value.length) parts.push(`${folders.value.length} 个文件夹`);
  parts.push(`${levelLinks.value.length} 条书签`);
  return parts.join(' · ') + (trail.value.length ? '' : ` · 全部共 ${total.value} 条`);
});

watch(kw, () => (shown.value = 0));
watch(path, () => (shown.value = 0), { deep: true });

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
  } catch (e) {
    tree.value = [];
    total.value = 0;
    toast('书签读取失败：' + (e as Error).message);
  }
}

onMounted(loadBookmarks);
</script>

<template>
  <div class="card bookmarks-card">
    <div class="card-head">
      <div class="head-text">
        <h2>书签</h2>
        <div class="card-sub">按文件夹浏览 · 输入关键字搜索</div>
      </div>
      <span class="badge">{{ badgeText }}</span>
    </div>
    <input v-model="kw" class="line-input" type="text" placeholder="搜索书签或文件夹…" autocomplete="off" />

    <div v-if="!searching && tree.length" class="bm-bar">
      <button v-if="trail.length" class="bm-back" title="返回上一级" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <span class="bm-crumb" :class="{ current: !trail.length }" title="全部书签" @click="trail.length && gotoCrumb(0)">全部书签</span>
      <template v-for="(folder, i) in trail" :key="folder.id">
        <span class="bm-crumb-sep">›</span>
        <span class="bm-crumb" :class="{ current: i === trail.length - 1 }" :title="folder.title" @click="i < trail.length - 1 && gotoCrumb(i + 1)">{{ folder.title }}</span>
      </template>
    </div>

    <ul class="bm-list">
      <li v-if="!tree.length" class="bm-empty">
        {{ hasApi ? '没有找到书签，在 Chrome 中收藏一些网页试试' : '安装为扩展后可自动读取浏览器书签' }}
      </li>
      <li v-else-if="searching && !matched.length" class="bm-empty">没有匹配的书签</li>
      <li v-else-if="!searching && !levelAll.length" class="bm-empty">这个文件夹是空的</li>

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
          显示更多（还有 {{ matched.length - visibleMatched.length }} 项）
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
          显示更多（还有 {{ levelAll.length - visibleLevel.length }} 项）
        </li>
      </template>
    </ul>

    <div class="list-foot">{{ footText }}</div>
  </div>
</template>
