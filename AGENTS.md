# AGENTS.md

给 AI 编码代理（以及新加入的协作者）的仓库约定。以本文件为准，与下面规则冲突的旧习惯应当调整。

## 版本号：只在用户明确要求时更新

- **未经用户明确说明需要更新版本号（例如「发版」「升版本号」「升到 0.7.0」），不要改动任何版本号，保持原样。**
- 完成一个功能、修一个 bug、做一次提交，本身都**不构成**升版本号的理由。
- 用户明确要求发版时，下面三处版本号必须同步修改，缺一不可：
  1. `package.json` → `version`
  2. `wxt.config.ts` → `manifest.version`
  3. `utils/i18n.ts` → `settings.about`（中英文两处版本字样）
- README 的「更新记录 / Changelog」里**带版本号的条目**同样只在明确发版时新增；未发版的功能改动只更新功能表，不要新起版本条目。
- 发版时顺带把上一条目上的「当前 / current」标记移到新版本条目上。

## 常用命令

- 类型检查：`pnpm type-check`
- 生产构建：`pnpm build`（产物在 `.output/chrome-mv3/`）

## 其他约定

- 项目为 WXT + Vue 3 + TypeScript 浏览器扩展；所有界面文案走 `utils/i18n.ts` 的扁平字典，新增文案时中英双语（`zh` / `en`）需同时补齐。
- `README.md` 与 `README.en.md` 需要保持同步更新。
- 提交信息使用 Conventional Commits（如 `feat(todo): ...`、`fix(ui): ...`、`docs(agents): ...`），一次提交聚焦一件事。
- 存储分层：用户数据（设置、待办、快捷访问、RSS 订阅地址）存 `chrome.storage.sync`；缓存与设备状态存 `chrome.storage.local`（详见 README「数据」一节）。
