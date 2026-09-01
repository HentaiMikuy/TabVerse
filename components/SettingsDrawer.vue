<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useSettings } from '../composables/useSettings';
import { useToast } from '../composables/useToast';
import { useWeather } from '../composables/useWeather';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { settings } = useSettings();
const { toast } = useToast();
const { loadWeather } = useWeather();

const cityInput = ref('');

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

      <h3>关于</h3>
      <p class="about">TabVerse v0.3.0 · 信息聚合新标签页<br />聚合搜索 / 快捷方式 / 天气 / 待办 / 浏览器书签，数据仅保存在本地浏览器中。</p>
    </div>
  </aside>
</template>
