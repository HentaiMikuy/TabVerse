import { reactive, watch } from 'vue';
import { DEFAULT_SETTINGS, type Settings } from '../utils/common';
import { K_SETTINGS, storeGet, storeSet } from './useStorage';

const settings = reactive<Settings>({ ...DEFAULT_SETTINGS });

function applyTheme() {
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('dark-theme', settings.theme === 'dark');
  }
}

let loading: Promise<void> | null = null;

export function useSettings() {
  if (!loading) {
    loading = storeGet<Partial<Settings>>(K_SETTINGS, {}).then((s) => {
      Object.assign(settings, s);
      applyTheme();
    });
    watch(
      settings,
      (val) => {
        storeSet(K_SETTINGS, { ...val });
        applyTheme();
      },
      { deep: true }
    );
  }
  // ready：设置从存储加载完成的 Promise，调用方可在挂载后等待再读取 city 等字段
  return { settings, ready: loading };
}
