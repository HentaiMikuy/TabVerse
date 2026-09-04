<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DEFAULT_SETTINGS } from '../utils/common';
import { useSettings } from '../composables/useSettings';
import { useToast } from '../composables/useToast';
import { useWeather } from '../composables/useWeather';
import { K_LINKS, K_RSS, K_RSS_REMOVED, K_SETTINGS, K_TODOS, storeGet, storeSet } from '../composables/useStorage';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { settings } = useSettings();
const { toast } = useToast();
const { loadWeather } = useWeather();

const cityInput = ref('');
const fileInput = ref<HTMLInputElement>();

watch(
  () => props.open,
  (open) => {
    if (open) cityInput.value = settings.city || '';
  }
);

function applyCity() {
  const city = cityInput.value.trim();
  settings.city = city;
  emit('close');
  toast(city ? `天气城市已设为「${city}」` : '已恢复自动定位');
  loadWeather(true);
}

/* ---------- 数据导出 / 导入 ---------- */

interface ExportPayload {
  app: string;
  version: number;
  exportedAt: string;
  settings?: unknown;
  links?: unknown;
  rssFeeds?: unknown;
  rssRemoved?: unknown;
  todos?: unknown;
}

async function exportData() {
  const [links, rssFeeds, rssRemoved, todos] = await Promise.all([
    storeGet(K_LINKS, null),
    storeGet(K_RSS, null),
    storeGet(K_RSS_REMOVED, []),
    storeGet(K_TODOS, []),
  ]);
  const payload: ExportPayload = {
    app: 'tabverse',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...settings },
    links,
    rssFeeds,
    rssRemoved,
    todos,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tabverse-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出设置与数据');
}

async function importData(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const data = (await file.text().then(JSON.parse)) as ExportPayload;
    if (data?.app !== 'tabverse') throw new Error('不是 TabVerse 的导出文件');
    if (data.settings && typeof data.settings === 'object') {
      await storeSet(K_SETTINGS, { ...DEFAULT_SETTINGS, ...(data.settings as object) });
    }
    if (Array.isArray(data.links)) await storeSet(K_LINKS, data.links);
    if (Array.isArray(data.rssFeeds)) await storeSet(K_RSS, data.rssFeeds);
    if (Array.isArray(data.rssRemoved)) await storeSet(K_RSS_REMOVED, data.rssRemoved);
    if (Array.isArray(data.todos)) await storeSet(K_TODOS, data.todos);
    toast('导入成功，正在刷新…');
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    toast('导入失败：' + (err instanceof Error ? err.message : '文件格式错误'));
  } finally {
    if (fileInput.value) fileInput.value.value = '';
  }
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}

onMounted(() => document.addEventListener('keydown', onDocKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onDocKeydown));
</script>

<template>
  <div class="drawer-backdrop" :class="{ hidden: !open }" @click="emit('close')"></div>
  <aside class="settings-drawer" :class="{ open }" :aria-hidden="!open">
    <div class="drawer-head">
      <h2>设置</h2>
      <button class="icon-btn" @click="emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="drawer-body">
      <h3>外观</h3>
      <p class="field-tip">深色 / 浅色模式可点击右上角的太阳或月亮图标切换。</p>

      <h3>天气城市</h3>
      <div class="field-row">
        <input v-model="cityInput" type="text" placeholder="留空自动定位，如：上海" autocomplete="off" @keydown.enter="applyCity" />
        <button class="dark-btn" @click="applyCity">保存</button>
      </div>
      <p class="field-tip">自动定位失败时会使用北京作为默认城市。</p>

      <h3>GitHub 贡献热力图</h3>
      <div class="field-row">
        <select v-model="settings.ghHeatRange" class="gh-select range-select" aria-label="贡献热力图时间范围">
          <option value="quarter">最近三个月</option>
          <option value="half">最近半年</option>
          <option value="year">最近一年</option>
          <option value="two">最近两年</option>
          <option value="all">全部历史</option>
        </select>
      </div>
      <p class="field-tip">控制 GitHub Profile 中贡献热力图的显示时间范围，保存后立即生效。</p>

      <h3>GitHub 登录（可选）</h3>
      <div class="field-row">
        <input v-model="settings.ghClientId" type="text" placeholder="OAuth App Client ID（可选）" autocomplete="off" spellcheck="false" />
      </div>
      <p class="field-tip">
        在本项目 <a href="https://github.com/settings/developers" target="_blank" rel="noreferrer">GitHub → Settings → Developer settings → OAuth Apps</a> 新建应用（任意名称/主页，无需配置回调）后填写其 Client ID，即可在 GitHub 面板登录，API 配额由 60 次/时提升到 5000 次/时。
      </p>

      <h3>数据管理</h3>
      <div class="field-row">
        <button class="data-btn" @click="exportData">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="3" y2="15" />
          </svg>
          导出数据
        </button>
        <button class="data-btn" @click="fileInput?.click()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
          </svg>
          导入数据
        </button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden-input" @change="importData" />
      </div>
      <p class="field-tip">导出内容含设置、快捷方式、RSS 订阅与待办，可在其他浏览器中导入恢复。</p>

      <h3>关于</h3>
      <p class="about">TabVerse v0.4.0 · 信息聚合新标签页<br />聚合搜索 / 快捷方式 / 天气 / 待办 / 浏览器书签，数据仅保存在本地浏览器中。</p>
    </div>
  </aside>
</template>
