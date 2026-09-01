import { ref } from 'vue';
import { K_SUBVIEW, K_TAB, storeGet, storeSet } from './useStorage';

export interface TabDef {
  id: string;
  name: string;
}

/** 内容区标签页注册表：新增模块时在此注册，并在 App.vue 中添加对应面板 */
export const TABS: TabDef[] = [
  { id: 'home', name: '主页' },
  { id: 'github', name: 'GitHub' },
];

const activeTab = ref('home');
const subbarView = ref<'links' | 'tabs'>('links');

let loading: Promise<void> | null = null;

export function useTabs() {
  if (!loading) {
    loading = Promise.all([storeGet<string>(K_TAB, 'home'), storeGet<'links' | 'tabs'>(K_SUBVIEW, 'links')]).then(
      ([tab, view]) => {
        if (TABS.some((t) => t.id === tab)) activeTab.value = tab;
        subbarView.value = view;
      }
    );
  }

  function switchTab(id: string) {
    if (!TABS.some((t) => t.id === id)) return;
    activeTab.value = id;
    storeSet(K_TAB, id);
  }

  function toggleSubbar() {
    subbarView.value = subbarView.value === 'tabs' ? 'links' : 'tabs';
    storeSet(K_SUBVIEW, subbarView.value);
  }

  return { activeTab, subbarView, switchTab, toggleSubbar };
}
