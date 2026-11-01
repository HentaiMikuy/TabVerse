import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { migrateStorageLayout } from '../../composables/useStorage';

/* 先把历史上误放在 sync 的缓存 / 设备态迁到 local，再挂载应用，避免组件读到迁移前的旧位置 */
migrateStorageLayout().finally(() => {
  createApp(App).mount('#app');
});
