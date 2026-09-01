<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { avatarColor, hostOf } from '../utils/common';
import { faviconUrl, loadFavicon } from '../composables/useFavicon';

const props = withDefaults(
  defineProps<{
    url: string;
    name: string;
    iconClass?: string;
  }>(),
  { iconClass: 'bm-icon' }
);

const failed = ref(false); // 直连加载也失败 → 回退字母头像
const cachedSrc = ref(''); // 缓存命中的 dataURL
const host = computed(() => hostOf(props.url));
const letter = computed(() => ((props.name || host.value || '?').trim()[0] || '?').toUpperCase());
const color = computed(() => avatarColor(host.value || props.name || '?'));
const directUrl = computed(() => faviconUrl(host.value));

let token = 0; // 竞态保护：host 变化后丢弃旧请求的结果

async function resolve() {
  const myToken = ++token;
  failed.value = false;
  cachedSrc.value = '';
  const dataUrl = await loadFavicon(host.value);
  if (myToken !== token) return; // 已有更新的请求
  if (!host.value) {
    failed.value = true;
    return;
  }
  if (dataUrl) cachedSrc.value = dataUrl;
  // dataUrl 为空：走直连 img（不缓存），加载失败再由 @error 置 failed
}

watch(host, () => void resolve(), { immediate: true });
</script>

<template>
  <span :class="iconClass" :style="failed ? { background: color } : undefined">
    <img v-if="!failed" :src="cachedSrc || directUrl" alt="" loading="lazy" @error="failed = true" />
    <template v-else>{{ letter }}</template>
  </span>
</template>
