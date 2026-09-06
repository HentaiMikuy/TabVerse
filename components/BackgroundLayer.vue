<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useBackground } from '../composables/useBackground';
import { useSettings } from '../composables/useSettings';

const { bgUrl } = useBackground();
const { settings } = useSettings();

const active = computed(() => settings.minimal && settings.bgType !== 'none' && !!bgUrl.value);
const isVideo = computed(() => settings.bgType === 'video');
const videoFailed = ref(false);

const videoEl = ref<HTMLVideoElement>();

/** 页面不可见时暂停视频，省资源；回到前台恢复播放 */
function onVisibility() {
  if (!videoEl.value) return;
  if (document.hidden) {
    videoEl.value.pause();
  } else {
    void videoEl.value.play().catch(() => {});
  }
}

onMounted(() => document.addEventListener('visibilitychange', onVisibility));
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility));
</script>

<template>
  <!-- z-index:-1 垫在整页内容之下，只在 body 背景之上露出 -->
  <div v-if="active && !videoFailed" class="bg-layer">
    <video
      v-if="isVideo"
      ref="videoEl"
      class="bg-media"
      :src="bgUrl"
      autoplay
      muted
      loop
      playsinline
      @error="videoFailed = true"
    ></video>
    <div v-else class="bg-media bg-image" :style="{ backgroundImage: `url('${bgUrl}')` }"></div>
    <div class="bg-scrim" :style="{ opacity: settings.bgScrim }"></div>
  </div>
</template>
