<script setup lang="ts">
import { computed, ref } from 'vue';
import { avatarColor, hostOf } from '../utils/common';

const props = withDefaults(
  defineProps<{
    url: string;
    name: string;
    iconClass?: string;
  }>(),
  { iconClass: 'bm-icon' }
);

const failed = ref(false);
const host = computed(() => hostOf(props.url));
const letter = computed(() => ((props.name || host.value || '?').trim()[0] || '?').toUpperCase());
const color = computed(() => avatarColor(host.value || props.name || '?'));
const src = computed(() => `https://www.google.com/s2/favicons?domain=${host.value}&sz=32`);
</script>

<template>
  <span :class="iconClass" :style="failed ? { background: color } : undefined">
    <img v-if="!failed" :src="src" alt="" loading="lazy" @error="failed = true" />
    <template v-else>{{ letter }}</template>
  </span>
</template>
