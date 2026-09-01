<script setup lang="ts">
import { onMounted, onUnmounted, reactive } from 'vue';
import { WEEKDAYS } from '../utils/common';
import { useSettings } from '../composables/useSettings';
import { useWeather } from '../composables/useWeather';

defineEmits<{ (e: 'open-settings'): void }>();

const { settings, ready: settingsReady } = useSettings();
const { weather, loadWeather } = useWeather();

const clock = reactive({ time: '--:--', sec: '00', date: '--', greeting: '你好' });

function tick() {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  clock.time = `${p(now.getHours())}:${p(now.getMinutes())}`;
  clock.sec = p(now.getSeconds());
  clock.date = `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAYS[now.getDay()]}`;
  const h = now.getHours();
  clock.greeting =
    h < 5 ? '夜深了，注意休息 🌃' : h < 11 ? '早上好 ☀️' : h < 13 ? '中午好 🍚' : h < 18 ? '下午好 🌤️' : '晚上好 🌙';
}

function toggleTheme() {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
}

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick();
  timer = setInterval(tick, 1000);
  // 等待设置从存储加载完成（含已保存的城市），避免竞态导致按默认城市/自动定位展示
  void settingsReady.then(() => loadWeather(false));
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <img src="/icons/icon48.png" alt="" class="brand-icon" />
      <span class="brand-name">TabVerse</span>
    </div>

    <div class="top-center">
      <div class="top-clock">{{ clock.time }}<span class="clock-sec">:{{ clock.sec }}</span></div>
      <div class="top-divider"></div>
      <div class="top-info">
        <div class="top-date">{{ clock.date }}</div>
        <div class="top-greeting">{{ clock.greeting }}</div>
      </div>
      <div class="top-divider"></div>
      <div class="top-weather" :style="{ opacity: weather.busy ? 0.75 : 1 }">
        <span class="weather-emoji">{{ weather.emoji }}</span>
        <div class="top-weather-text">
          <div class="top-weather-main">
            <span>{{ weather.temp }}</span>
            <span class="weather-city">{{ weather.city }}</span>
          </div>
          <div class="top-weather-sub">{{ weather.desc }}</div>
        </div>
        <button class="icon-btn small top-weather-refresh" title="刷新天气" @click="loadWeather(true)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
        </button>
      </div>
    </div>

    <div class="top-actions">
      <button class="icon-btn" title="切换深浅色" @click="toggleTheme">
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>
      <button class="icon-btn" title="设置" @click="$emit('open-settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        </svg>
      </button>
    </div>
  </header>
</template>
