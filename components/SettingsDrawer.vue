<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DEFAULT_SETTINGS, ENGINES, TIMEZONES } from '../utils/common';
import { useI18n } from '../utils/i18n';
import { useSettings } from '../composables/useSettings';
import { useToast } from '../composables/useToast';
import { useWeather } from '../composables/useWeather';
import { useBackground } from '../composables/useBackground';
import { K_LINKS, K_RSS, K_RSS_REMOVED, K_SETTINGS, K_TODOS, storeGet, storeSet } from '../composables/useStorage';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { settings } = useSettings();
const { toast } = useToast();
const { loadWeather } = useWeather();
const { bgUrl, setBgUrl } = useBackground();
const { t, isZh } = useI18n();

const cityInput = ref('');
const fileInput = ref<HTMLInputElement>();
const bgFileInput = ref<HTMLInputElement>();
const bgUrlInput = ref('');

/** 背景本地文件建议上限：超出时 chrome.storage.local 写入可能很慢，但允许尝试 */
const BG_FILE_WARN = 15 * 1024 * 1024;

watch(
  () => props.open,
  (open) => {
    if (open) {
      cityInput.value = settings.city || '';
      bgUrlInput.value = bgUrl.value;
    }
  }
);

function applyCity() {
  const city = cityInput.value.trim();
  settings.city = city;
  emit('close');
  toast(city ? t('settings.weatherCitySaved', { city }) : t('settings.weatherAuto'));
  loadWeather(true);
}

/* ---------- 简约模式与自定义背景 ---------- */

function pickBgType(type: 'none' | 'image' | 'video') {
  settings.bgType = type;
  if (type === 'none') {
    void setBgUrl('');
    toast(t('settings.bgCleared'));
  }
}

async function applyBgUrl() {
  const url = bgUrlInput.value.trim();
  if (!url) return;
  if (!/^(https?:\/\/|data:)/i.test(url)) {
    toast(t('settings.bgUrlInvalid'));
    return;
  }
  const ok = await setBgUrl(url);
  toast(ok ? t('settings.bgSaved') : t('settings.bgSaveFailed'));
}

function onPickBgFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > BG_FILE_WARN) toast(t('settings.bgFileLarge'));
  const reader = new FileReader();
  reader.onload = async () => {
    const ok = await setBgUrl(String(reader.result));
    toast(ok ? t('settings.bgSaved') : t('settings.bgSaveFailed'));
  };
  reader.readAsDataURL(file);
  (e.target as HTMLInputElement).value = '';
}

async function clearBg() {
  const ok = await setBgUrl('');
  bgUrlInput.value = '';
  toast(ok ? t('settings.bgCleared') : t('settings.bgClearFailed'));
}

function onBgKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') void applyBgUrl();
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
  toast(t('settings.exported'));
}

async function importData(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const data = (await file.text().then(JSON.parse)) as ExportPayload;
    if (data?.app !== 'tabverse') throw new Error(t('settings.notTabverse'));
    if (data.settings && typeof data.settings === 'object') {
      await storeSet(K_SETTINGS, { ...DEFAULT_SETTINGS, ...(data.settings as object) });
    }
    if (Array.isArray(data.links)) await storeSet(K_LINKS, data.links);
    if (Array.isArray(data.rssFeeds)) await storeSet(K_RSS, data.rssFeeds);
    if (Array.isArray(data.rssRemoved)) await storeSet(K_RSS_REMOVED, data.rssRemoved);
    if (Array.isArray(data.todos)) await storeSet(K_TODOS, data.todos);
    toast(t('settings.imported'));
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    toast(t('settings.importFailed', { msg: err instanceof Error ? err.message : t('settings.importFileError') }));
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
      <h2>{{ t('settings.title') }}</h2>
      <button class="icon-btn" @click="emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="drawer-body">
      <h3>{{ t('settings.lang') }}</h3>
      <div class="field-row">
        <select v-model="settings.lang" class="gh-select range-select" :aria-label="t('settings.lang')">
          <option value="auto">{{ t('lang.auto') }}</option>
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </div>
      <p class="field-tip">{{ t('settings.langTip') }}</p>

      <h3>{{ t('settings.appearance') }}</h3>
      <div class="field-row">
        <button
          class="seg-btn"
          :class="{ active: settings.theme === 'light' }"
          @click="settings.theme = 'light'"
        >
          {{ t('settings.light') }}
        </button>
        <button
          class="seg-btn"
          :class="{ active: settings.theme === 'dark' }"
          @click="settings.theme = 'dark'"
        >
          {{ t('settings.dark') }}
        </button>
      </div>

      <div class="switch-row">
        <span class="switch-label">{{ t('settings.minimal') }}</span>
        <label class="switch" :title="t('settings.minimal')">
          <input v-model="settings.minimal" type="checkbox" />
          <span class="track"></span>
        </label>
      </div>
      <p class="field-tip">{{ t('settings.minimalTip') }}</p>

      <h3>{{ t('settings.background') }}</h3>
      <div class="field-row bg-type-row">
        <button class="seg-btn" :class="{ active: settings.bgType === 'none' }" @click="pickBgType('none')">
          {{ t('settings.bgNone') }}
        </button>
        <button class="seg-btn" :class="{ active: settings.bgType === 'image' }" @click="pickBgType('image')">
          {{ t('settings.bgImage') }}
        </button>
        <button class="seg-btn" :class="{ active: settings.bgType === 'video' }" @click="pickBgType('video')">
          {{ t('settings.bgVideo') }}
        </button>
      </div>

      <template v-if="settings.bgType !== 'none'">
        <div class="field-row bg-file-row">
          <button class="data-btn" @click="bgFileInput?.click()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            {{ settings.bgType === 'image' ? t('settings.bgPickImage') : t('settings.bgPickVideo') }}
          </button>
          <button class="data-btn" @click="clearBg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            {{ t('settings.bgClear') }}
          </button>
        </div>
        <input ref="bgFileInput" type="file" :accept="settings.bgType === 'image' ? 'image/*' : 'video/*'" class="hidden-input" @change="onPickBgFile" />

        <div class="field-row bg-url-row">
          <input
            v-model="bgUrlInput"
            type="text"
            :placeholder="settings.bgType === 'image' ? t('settings.bgUrlImage') : t('settings.bgUrlVideo')"
            autocomplete="off"
            spellcheck="false"
            @keydown.enter="onBgKeydown"
          />
          <button class="dark-btn bg-apply" @click="applyBgUrl">{{ t('settings.bgApply') }}</button>
        </div>

        <div v-if="bgUrl" class="bg-preview">
          <img v-if="settings.bgType === 'image'" :src="bgUrl" :alt="t('settings.bgImage')" />
          <video v-else :src="bgUrl" muted playsinline preload="metadata" loop></video>
        </div>

        <div class="range-row">
          <span class="range-label">{{ t('settings.bgScrim') }}</span>
          <input v-model.number="settings.bgScrim" type="range" min="0" max="1" step="0.05" />
          <span class="range-val">{{ Math.round(settings.bgScrim * 100) }}%</span>
        </div>
        <p class="field-tip">{{ t('settings.bgTip') }}</p>
      </template>

      <h3>{{ t('settings.engine') }}</h3>
      <div class="field-row">
        <select v-model="settings.engineId" class="gh-select range-select" :aria-label="t('settings.engine')">
          <option v-for="eng in ENGINES" :key="eng.id" :value="eng.id">{{ eng.name }}</option>
        </select>
      </div>
      <p class="field-tip">{{ t('settings.engineTip') }}</p>

      <h3>{{ t('settings.timezone') }}</h3>
      <div class="field-row">
        <select v-model="settings.timezone" class="gh-select range-select" :aria-label="t('settings.timezone')">
          <option v-for="tz in TIMEZONES" :key="tz.id" :value="tz.id">{{ tz.name[isZh ? 'zh' : 'en'] }}</option>
        </select>
      </div>
      <p class="field-tip">{{ t('settings.timezoneTip') }}</p>

      <h3>{{ t('settings.weatherCity') }}</h3>
      <div class="field-row">
        <input v-model="cityInput" type="text" :placeholder="t('settings.weatherPlaceholder')" autocomplete="off" @keydown.enter="applyCity" />
        <button class="dark-btn" @click="applyCity">{{ t('settings.weatherSave') }}</button>
      </div>
      <p class="field-tip">{{ t('settings.weatherTip') }}</p>

      <h3>{{ t('settings.heat') }}</h3>
      <div class="field-row">
        <select v-model="settings.ghHeatRange" class="gh-select range-select" :aria-label="t('settings.heat')">
          <option value="quarter">{{ t('gh.heatRange.quarter') }}</option>
          <option value="half">{{ t('gh.heatRange.half') }}</option>
          <option value="year">{{ t('gh.heatRange.year') }}</option>
          <option value="two">{{ t('gh.heatRange.two') }}</option>
          <option value="all">{{ t('gh.heatRange.all') }}</option>
        </select>
      </div>
      <p class="field-tip">{{ t('settings.heatTip') }}</p>

      <h3>{{ t('settings.ghLogin') }}</h3>
      <div class="field-row">
        <input v-model="settings.ghClientId" type="text" :placeholder="t('settings.ghClientPlaceholder')" autocomplete="off" spellcheck="false" />
      </div>
      <p class="field-tip">
        {{ t('settings.ghLoginTip') }} <a href="https://github.com/settings/developers" target="_blank" rel="noreferrer">GitHub → Settings → Developer settings → OAuth Apps</a> {{ t('settings.ghLoginTip2') }}
      </p>

      <h3>{{ t('settings.data') }}</h3>
      <div class="field-row">
        <button class="data-btn" @click="exportData">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="3" y2="15" />
          </svg>
          {{ t('settings.export') }}
        </button>
        <button class="data-btn" @click="fileInput?.click()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
          </svg>
          {{ t('settings.import') }}
        </button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden-input" @change="importData" />
      </div>
      <p class="field-tip">{{ t('settings.importTip') }}</p>

      <h3>{{ t('settings.aboutTitle') }}</h3>
      <p class="about">{{ t('settings.about') }}</p>
    </div>
  </aside>
</template>
