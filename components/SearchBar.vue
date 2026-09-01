<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { ENGINES } from '../utils/common';
import { useSettings } from '../composables/useSettings';

const { settings } = useSettings();
const q = ref('');
const menuOpen = ref(false);
const inputEl = ref<HTMLInputElement>();

const engine = computed(() => ENGINES.find((e) => e.id === settings.engineId) || ENGINES[0]);

function pickEngine(id: string) {
  settings.engineId = id;
  menuOpen.value = false;
  inputEl.value?.focus();
}

function doSearch() {
  const query = q.value.trim();
  if (!query) return;
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
      placeholder="搜索或输入网址"
      autocomplete="off"
      spellcheck="false"
      @keydown.enter="doSearch"
    />
    <button class="engine-btn" title="切换搜索引擎" @click.stop="menuOpen = !menuOpen">
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
    <button class="go-btn" title="搜索" @click="doSearch">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  </div>
</template>
