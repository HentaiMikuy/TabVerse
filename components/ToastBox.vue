<script setup lang="ts">
import { useToast } from '../composables/useToast';

const { toastState } = useToast();
</script>

<template>
  <div class="toast" :class="{ hidden: !toastState.visible }">{{ toastState.message }}</div>
</template>
