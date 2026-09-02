# TabVerse

Chrome 新标签页信息聚合仪表盘

一个让 Chrome 新标签页更好用、信息更聚合的浏览器扩展。

默认的新标签页只有一个搜索框和背景图，TabVerse 把它变成一个简约风格的信息聚合仪表盘（卡片式布局，设计语言参考 [XTab](https://github.com/pkc918/XTab)）：

![TabVerse 主界面](screenshots/home.png)

![GitHub Profile 页面](screenshots/github.png)

| 功能 | 说明 |
|------|------|
| 🔍 聚合搜索 | Google / Bing / 百度 / DuckDuckGo / GitHub 引擎下拉切换；输入网址直接打开；按 `/` 快速聚焦 |
| 🔗 快捷方式 | 胶囊式常用网站，可添加 / 删除（「管理」模式），自动抓取站点图标，失败时回退字母头像 |
| 🔖 浏览器书签 | 按文件夹逐层浏览（面包屑导航），支持全局关键字搜索并标注所在路径 |
| ✅ 待办事项 | 添加 / 完成 / 删除 / 一键清除已完成，本地保存 |
| 🌤️ 天气 | 免费开源 Open-Meteo 数据，自动 IP 定位 |
| 🗂️ 标签页框架 | 内容区按标签页组织模块，副栏一键切换「快捷方式 ⇄ 标签页」 |
| 🕐 时钟问候 | 实时时钟、日期与分时段问候 |
| ☀️ 深浅色 | 点击右上角图标切换深浅模式 |

数据仅保存在本地（`chrome.storage.sync`），无任何上报。

## 技术栈

**WXT + Vue 3 + TypeScript**

- [WXT](https://wxt.dev/)
- Vue 3 + Composition API
- TypeScript（零类型错误）

## 安装

1. 执行 `pnpm build`
2. 打开 Chrome，进入 `chrome://extensions`
3. 开启开发者模式 → 加载已解压的扩展程序 → 选择 `.output/chrome-mv3/`
4. 打开新标签页即可体验

## 更新记录

- **v0.4.0**（当前）：订阅源支持删除（chip 悬停 ✕），Google Research 改用官方 RSS 源并自动迁移老配置；GitHub 数据 30 分钟本地缓存 + 限流状态持久化——限流窗口内打开新标签页直接显示倒计时、不再发无效请求，重置后自动重试；书签双栏视图（左目录树 + 右书签，右上角图标切换，搜索跨视图可用）；站点图标两级本地缓存（内存 + `chrome.storage.local`，并发去重、容量上限）；修复相对时间显示负号、副栏按钮与内容列宽度错位等问题
- **v0.3.0**：初始版本。WXT + Vue 3 + TypeScript 全新实现：聚合搜索、快捷方式、天气、待办、书签面包屑目录浏览、标签页框架（快捷方式 ⇄ 标签页）、RSS 阅读与 GitHub Discover / Profile 面板、深浅色

### 规划中

- 快捷方式拖拽排序、编辑已有快捷方式
- 设置导出 / 导入
- 交互打磨与性能优化

## 隐私

- 不收集任何数据
- 天气、图标走公开免费接口
- 仅申请 `storage`、`bookmarks` 两个权限

