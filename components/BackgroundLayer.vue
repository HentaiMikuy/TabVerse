<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useBackground } from '../composables/useBackground';
import { useSettings } from '../composables/useSettings';

const { bgUrl } = useBackground();
const { settings } = useSettings();

const active = computed(() => settings.minimal && settings.bgType !== 'none' && !!bgUrl.value);
const isVideo = computed(() => settings.bgType === 'video');
const videoFailed = ref(false);

const videoEl = ref<HTMLVideoElement>();

/** 背景是否实际显示（含加载失败），驱动淡入淡出 */
const bgOn = computed(() => active.value && !videoFailed.value);

// 背景随模式切换淡入淡出，而不是瞬间移除；淡出后暂停视频避免后台解码
watch(bgOn, (on) => {
  if (!videoEl.value) return;
  if (on) {
    void videoEl.value.play().catch(() => {});
  } else {
    videoEl.value.pause();
  }
});

/** 页面不可见时暂停视频，省资源；回到前台恢复播放 */
function onVisibility() {
  if (!videoEl.value) return;
  if (document.hidden) {
    videoEl.value.pause();
  } else if (bgOn.value) {
    void videoEl.value.play().catch(() => {});
  }
}

onMounted(() => document.addEventListener('visibilitychange', onVisibility));
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility));
</script>

<template>
  <!-- z-index:-1 垫在整页内容之下，只在 body 背景之上露出 -->
  <div class="bg-layer" :class="{ on: bgOn }">
    <template v-if="bgUrl">
      <video
        v-if="isVideo"
        ref="videoEl"
        class="bg-media"
        :src="bgUrl"
        :autoplay="bgOn"
        muted
        loop
        playsinline
        @error="videoFailed = true"
      ></video>
      <div v-else class="bg-media bg-image" :style="{ backgroundImage: `url('${bgUrl}')` }"></div>
    </template>
    <div class="bg-scrim" :style="{ opacity: settings.bgScrim }"></div>
  </div>
</template>
