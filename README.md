# TabVerse

一个让 Chrome 新标签页更好用、信息更聚合的浏览器扩展。

默认的新标签页只有一个搜索框和背景图，TabVerse 把它变成一个简约风格的信息聚合仪表盘（卡片式布局，设计语言参考 [XTab](https://github.com/pkc918/XTab)）：

| 功能 | 说明 |
| --- | --- |
| 🔍 聚合搜索 | Google / Bing / 百度 / DuckDuckGo / GitHub 引擎下拉切换；输入网址直接打开；按 `/` 快速聚焦 |
| 🔗 快捷方式 | 胶囊式常用网站，可添加 / 删除（「管理」模式），自动抓取站点图标，失败时回退字母头像 |
| 🔖 浏览器书签 | 按文件夹逐层浏览（面包屑导航），支持全局关键字搜索并标注所在路径；大目录分页展示，海量书签不卡顿 |
| ✅ 待办事项 | 添加 / 完成 / 删除 / 一键清除已完成，本地保存 |
| 🌤️ 天气 | 免费开源 Open-Meteo 数据，自动 IP 定位（失败回退北京），可在设置中手动指定城市 |
| 🗂️ 标签页框架 | 内容区按标签页组织模块，副栏一键切换「快捷方式 ⇄ 标签页」，模块可自由扩展（RSS、GitHub 等） |
| 🕐 时钟问候 | 实时时钟、日期与分时段问候 |
| ☀️ 深浅色 | 点击右上角图标切换深色模式 |

页面锁定在一屏内不滚动，滚动只发生在模块内部。数据仅保存在本地（`chrome.storage.sync`，不可用时回退 `localStorage`），无任何上报。

## 技术栈

**WXT + Vue 3 + TypeScript**（与 [XTab](https://github.com/pkc918/XTab) 同一套技术栈）：

- [WXT](https://wxt.dev/)：浏览器扩展开发框架（MV3），自带热更新、自动打包、manifest 生成
- Vue 3：单文件组件 + 组合式 API（`components/` + `composables/`）
- TypeScript：全量类型，`pnpm type-check` 零报错

## 开发与构建

```bash
pnpm install        # 安装依赖
pnpm dev            # 开发模式（HMR 热更新，自动打开浏览器）
pnpm build          # 生产构建 → .output/chrome-mv3/
pnpm zip            # 打包发布 zip
pnpm type-check     # vue-tsc 类型检查
```

## 安装

1. 执行 `pnpm build`
2. 打开 Chrome，地址栏进入 `chrome://extensions`
3. 打开右上角「**开发者模式**」，点「**加载已解压的扩展程序**」，选择 `.output/chrome-mv3` 目录
4. 打开一个新标签页即可看到效果

## 目录结构

```
TabVerse/
├── wxt.config.ts          # WXT 配置与 manifest 声明（storage / bookmarks 权限）
├── package.json
├── entrypoints/newtab/    # 新标签页入口：index.html / main.ts / App.vue / style.css
├── components/            # TopBar / SearchBar / SubBar / BookmarkPanel
│                          # TodoPanel / SettingsDrawer / ToastBox / SiteIcon
├── composables/           # useStorage / useSettings / useTabs / useToast / useWeather
├── utils/common.ts        # 搜索引擎、默认快捷方式、WMO 天气表、工具函数
├── public/icons/          # 扩展图标
└── tools/gen_icons.py     # 图标生成脚本
```

## 扩展新模块（标签页）

1. 在 `composables/useTabs.ts` 的 `TABS` 中注册：`{ id: 'feed', name: 'RSS · GitHub' }`
2. 在 `entrypoints/newtab/App.vue` 中添加对应面板组件（面板内可自由布局，如三栏）
3. 新模块逻辑写成 `composables/useXxx.ts` + `components/XxxPanel.vue`

## 路线（参考 [pkc918/XTab](https://github.com/pkc918/XTab)）

- **v0.3**：✅ 迁移到 WXT + Vue 3 + TypeScript；书签改为面包屑按目录浏览；引入标签页框架
- **v0.4**：RSS Reader 模块；快捷方式拖拽排序、编辑已有快捷方式
- **v0.5**：GitHub Discover（Trending / 语言筛选）、GitHub Profile 面板
- **v1.0**：设置导出/导入，交互打磨与性能优化

## 隐私

- 不收集任何数据；天气、图标走公开免费接口
- 书签仅在本地读取展示，不上传任何数据
- 扩展仅申请 `storage`、`bookmarks` 两个权限
