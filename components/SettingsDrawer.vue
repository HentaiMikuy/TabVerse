<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DEFAULT_SETTINGS } from '../utils/common';
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
  toast(city ? `天气城市已设为「${city}」` : '已恢复自动定位');
  loadWeather(true);
}

/* ---------- 简约模式与自定义背景 ---------- */

function pickBgType(type: 'none' | 'image' | 'video') {
  settings.bgType = type;
  if (type === 'none') {
    void setBgUrl('');
    toast('已关闭自定义背景');
  }
}

async function applyBgUrl() {
  const url = bgUrlInput.value.trim();
  if (!url) return;
  if (!/^(https?:\/\/|data:)/i.test(url)) {
    toast('背景地址需以 http(s):// 开头');
    return;
  }
  const ok = await setBgUrl(url);
  toast(ok ? '背景已保存' : '背景保存失败：内容过大');
}

function onPickBgFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > BG_FILE_WARN) toast('文件较大，保存可能需要一些时间');
  const reader = new FileReader();
  reader.onload = async () => {
    const ok = await setBgUrl(String(reader.result));
    toast(ok ? '背景已保存' : '背景保存失败：内容过大');
  };
  reader.readAsDataURL(file);
  (e.target as HTMLInputElement).value = '';
}

async function clearBg() {
  const ok = await setBgUrl('');
  bgUrlInput.value = '';
  toast(ok ? '已清除背景' : '清除失败，请重试');
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
      <div class="field-row">
        <button
          class="seg-btn"
          :class="{ active: settings.theme === 'light' }"
          @click="settings.theme = 'light'"
        >
          浅色
        </button>
        <button
          class="seg-btn"
          :class="{ active: settings.theme === 'dark' }"
          @click="settings.theme = 'dark'"
        >
          深色
        </button>
      </div>

      <div class="switch-row">
        <span class="switch-label">简约模式</span>
        <label class="switch" title="仅显示时间日期与搜索框">
          <input v-model="settings.minimal" type="checkbox" />
          <span class="track"></span>
        </label>
      </div>
      <p class="field-tip">开启后只显示时间日期与搜索框，隐藏所有面板，点击右上角齿轮可随时退出。</p>

      <h3>自定义背景</h3>
      <div class="field-row">
        <button class="seg-btn" :class="{ active: settings.bgType === 'none' }" @click="pickBgType('none')">
          无
        </button>
        <button class="seg-btn" :class="{ active: settings.bgType === 'image' }" @click="pickBgType('image')">
          图片
        </button>
        <button class="seg-btn" :class="{ active: settings.bgType === 'video' }" @click="pickBgType('video')">
          视频
        </button>
      </div>

      <template v-if="settings.bgType !== 'none'">
        <div class="field-row">
          <button class="data-btn" @click="bgFileInput?.click()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            {{ settings.bgType === 'image' ? '选择图片文件' : '选择视频文件' }}
          </button>
          <button class="data-btn" @click="clearBg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            清除背景
          </button>
        </div>
        <input ref="bgFileInput" type="file" :accept="settings.bgType === 'image' ? 'image/*' : 'video/*'" class="hidden-input" @change="onPickBgFile" />

        <div class="field-row bg-url-row">
          <input
            v-model="bgUrlInput"
            type="text"
            :placeholder="settings.bgType === 'image' ? '或粘贴图片 URL' : '或粘贴视频 URL'"
            autocomplete="off"
            spellcheck="false"
            @keydown.enter="onBgKeydown"
          />
          <button class="dark-btn bg-apply" @click="applyBgUrl">应用</button>
        </div>

        <div v-if="bgUrl" class="bg-preview">
          <img v-if="settings.bgType === 'image'" :src="bgUrl" alt="背景预览" />
          <video v-else :src="bgUrl" muted playsinline preload="metadata" loop></video>
        </div>

        <div class="range-row">
          <span class="range-label">遮罩</span>
          <input v-model.number="settings.bgScrim" type="range" min="0" max="1" step="0.05" />
          <span class="range-val">{{ Math.round(settings.bgScrim * 100) }}%</span>
        </div>
        <p class="field-tip">
          遮罩用于保证前景文字可读性；视频建议使用网络 URL，本地大文件可能超出存储配额。
        </p>
      </template>

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
      <p class="about">TabVerse v0.5.0 · 信息聚合新标签页<br />聚合搜索 / 快捷方式 / 天气 / 待办 / 浏览器书签，数据仅保存在本地浏览器中。</p>
    </div>
  </aside>
</template>
