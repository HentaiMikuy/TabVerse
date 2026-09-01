import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'TabVerse',
    version: '0.3.0',
    description: '更聚合、更好用的新标签页：聚合搜索、快捷方式、天气、待办、浏览器书签。卡片式仪表盘。',
    minimum_chrome_version: '100',
    chrome_url_overrides: {
      newtab: 'newtab.html',
    },
    permissions: ['storage', 'bookmarks'],
    // 允许新标签页直接读取任意 http(s) RSS 源，绕过 CORS，不依赖公共代理
    host_permissions: ['*://*/*'],
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },
});
