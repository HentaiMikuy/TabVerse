import { defineConfig } from 'wxt';

/* 固定扩展 ID 的公钥：解压加载的扩展默认按文件夹绝对路径派生 ID，换台电脑路径一变 ID 就变，
   而 chrome.storage.sync 按扩展 ID 分桶，数据会各存各的、在设备间永远对不上。固定后
   所有机器上的 ID 都是 dmbmniafnalfmgodhekabodolofmngec。
   对应私钥在 .keys/tabverse.pem（已 gitignore），仅在需要自行打包 .crx 时才会用到 */
const EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5+b0cxrTeL8gHrtBR/dzpUGWSfwqk4P+R/irzrUfKyUV3MQ9BnTc4lhfgeM7JK9Dl+NpqVYUerOIviTwv3A5eBpxLDylR1kLaQbbIbGUPm6He7y+6L8F4Z6xcSiaop6YeQE7U71QgcTesFZEdAWQ22I3IGI9u+lUax2ikHIyERS54SzjyrCegqRbVbuHjxTv+gH3lrZNBgEtd0c+7UM0+W2WT+QnEFnivgm2CfV+uvPpDe7K+tq27pBCxavvRfXzwkfdJI6XGnxHXcMRGt+ce86kwXRY54h5mZNrbrxRsy3TbCZ2tJdIWwStVYS0hqjKq7YYUHvL2sidHLgCifnjnwIDAQAB';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    key: EXTENSION_KEY,
    name: 'TabVerse',
    version: '0.6.1',
    description: '更聚合、更好用的新标签页信息仪表盘：聚合搜索、快捷访问、天气、待办、书签，RSS 阅读与 GitHub 动态。',
    minimum_chrome_version: '100',
    chrome_url_overrides: {
      newtab: 'newtab.html',
    },
    permissions: ['storage', 'bookmarks', 'unlimitedStorage'],
    // 允许新标签页直接读取任意 http(s) RSS 源，绕过 CORS，不依赖公共代理
    host_permissions: ['*://*/*'],
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },
});
