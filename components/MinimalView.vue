<script setup lang="ts">
import { useClock } from '../composables/useClock';
import { useSettings } from '../composables/useSettings';
import { useI18n } from '../utils/i18n';
import SearchBar from './SearchBar.vue';

defineEmits<{ (e: 'open-settings'): void }>();

const clock = useClock();
const { settings } = useSettings();
const { t } = useI18n();
</script>

<template>
  <div class="minimal-view" :class="{ 'on-bg': settings.bgType !== 'none' }">
    <div class="min-actions">
      <button class="min-settings" :title="t('topbar.minimal')" @click="settings.minimal = false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" x2="14" y1="3" y2="10" />
          <line x1="3" x2="10" y1="21" y2="14" />
        </svg>
      </button>
      <button class="min-settings" :title="t('topbar.settings')" @click="$emit('open-settings')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      </svg>
      </button>
    </div>

    <div class="min-center">
      <div class="min-clock">
        <span class="min-time">{{ clock.time }}</span><span class="min-sec">:{{ clock.sec }}</span>
      </div>
      <div class="min-date">{{ clock.date }}</div>
      <div class="min-greeting">{{ clock.greeting }}</div>
      <div class="min-search">
        <SearchBar />
      </div>
    </div>
  </div>
</template>
