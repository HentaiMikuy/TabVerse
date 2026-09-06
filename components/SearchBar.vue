<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { debounce, ENGINES } from '../utils/common';
import { useSettings } from '../composables/useSettings';
import { useI18n } from '../utils/i18n';

const { settings } = useSettings();
const { t } = useI18n();
const q = ref('');
const menuOpen = ref(false);
const inputEl = ref<HTMLInputElement>();

/* 搜索建议：输入时从 DuckDuckGo Ac 接口联想（失败/受限时静默降级为无建议） */
const suggestions = ref<string[]>([]);
const activeSug = ref(-1);
const sugOpen = ref(false);
const sugCache = new Map<string, string[]>(); // 最近查询的前缀缓存，防止来回打词重复请求
let version = 0; // 竞态保护：只采纳最后一次查询的结果

async function fetchSuggestions(kw: string) {
  const v = ++version;
  try {
    const r = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(kw)}&type=list&kl=cn-zh`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return;
    const data = (await r.json()) as string[];
    if (v !== version) return;
    const list = (Array.isArray(data) ? data : []).filter((s) => typeof s === 'string' && s);
    suggestions.value = list.slice(0, 6);
    sugOpen.value = suggestions.value.length > 0;
    activeSug.value = -1;
    if (list.length) sugCache.set(kw, list.slice(0, 6));
    if (sugCache.size > 60) sugCache.delete(sugCache.keys().next().value!);
  } catch {
    /* 网络受限：无建议 */
  }
}

const onInput = debounce((kw: string) => {
  if (!kw.trim()) {
    suggestions.value = [];
    sugOpen.value = false;
    return;
  }
  const cached = sugCache.get(kw);
  if (cached) {
    suggestions.value = cached;
    sugOpen.value = true;
    return;
  }
  void fetchSuggestions(kw);
}, 200);

function pickSuggestion(s: string) {
  sugOpen.value = false;
  q.value = s;
  doSearch();
}

function onSugKeydown(e: KeyboardEvent) {
  if (!sugOpen.value || !suggestions.value.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = suggestions.value.length;
    activeSug.value = (activeSug.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
  } else if (e.key === 'Escape') {
    sugOpen.value = false;
  }
}

const engine = computed(() => ENGINES.find((e) => e.id === settings.engineId) || ENGINES[0]);

function pickEngine(id: string) {
  settings.engineId = id;
  menuOpen.value = false;
  inputEl.value?.focus();
}

function doSearch() {
  sugOpen.value = false;
  let query = q.value.trim();
  if (!query) return;
  if (activeSug.value >= 0 && suggestions.value[activeSug.value]) {
    query = suggestions.value[activeSug.value];
    q.value = query;
  }
  const looksLikeUrl =
    /^https?:\/\//i.test(query) || (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(query) && !/\s/.test(query));
  if (looksLikeUrl) {
    location.href = /^https?:\/\//i.test(query) ? query : 'https://' + query;
    return;
  }
  location.href = engine.value.url.replace('%s', encodeURIComponent(query));
}

function onDocKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName?.toLowerCase() || '';
  const typing = tag === 'input' || tag === 'textarea';
  if (e.key === '/' && !typing) {
    e.preventDefault();
    inputEl.value?.focus();
  } else if (e.key === 'Escape' && menuOpen.value) {
    menuOpen.value = false;
  }
}

function onDocClick(e: MouseEvent) {
  if (menuOpen.value && !(e.target as Element).closest('.engine-menu')) {
    menuOpen.value = false;
  }
  if (sugOpen.value && !(e.target as Element).closest('.search-sug')) {
    sugOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDocKeydown);
  document.addEventListener('click', onDocClick);
  inputEl.value?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocKeydown);
  document.removeEventListener('click', onDocClick);
});
</script>

<template>
  <div class="search-bar">
    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
    <input
      id="searchInput"
      ref="inputEl"
      v-model="q"
      type="text"
      :placeholder="t('search.placeholder')"
      autocomplete="off"
      spellcheck="false"
      @input="onInput(q)"
      @keydown.enter="doSearch"
      @keydown="onSugKeydown"
    />
    <button class="engine-btn" :title="t('search.engine')" @click.stop="menuOpen = !menuOpen">
      <span>{{ engine.name }}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div class="engine-menu" :class="{ hidden: !menuOpen }">
      <button
        v-for="eng in ENGINES"
        :key="eng.id"
        :class="{ active: eng.id === settings.engineId }"
        @click="pickEngine(eng.id)"
      >
        <span>{{ eng.name }}</span>
        <span class="check">✓</span>
      </button>
    </div>
    <span class="kbd-hint">/</span>
    <button class="go-btn" :title="t('search.go')" @click="doSearch">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>

    <!-- 搜索建议下拉 -->
    <div v-if="sugOpen" class="search-sug">
      <button
        v-for="(s, i) in suggestions"
        :key="s"
        :class="{ active: i === activeSug }"
        @mousedown.prevent="pickSuggestion(s)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span>{{ s }}</span>
      </button>
    </div>
  </div>
</template>
