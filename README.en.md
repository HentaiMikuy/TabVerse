# TabVerse

[中文](./README.md)

A Chrome new tab info dashboard

A browser extension that makes Chrome's new tab page more useful and more aggregated.

By default, the new tab page only has a search box and a background image. TabVerse turns it into a minimal-style info dashboard (card layout, design language inspired by [XTab](https://github.com/pkc918/XTab)):

![TabVerse main view](screenshots/home.png)

![GitHub Profile view](screenshots/github.png)

| Feature | Description |
|------|------|
| 🔍 Aggregated search | Google / Bing / Baidu / DuckDuckGo / GitHub engine switcher (default configurable in settings); opens URLs directly; shows search suggestions while typing (arrow keys to select); press `/` to focus |
| 🔗 Shortcuts | Pill-shaped favorite sites; in "Manage" mode you can add / edit / delete and drag to reorder; site icons are fetched automatically, falling back to letter avatars |
| 🔖 Browser bookmarks | Browse folders level by level (breadcrumb navigation); split view supports "Default order / Recently added"; global keyword search with path annotation |
| ✅ To-dos | Add / complete / delete / clear all done; due dates and priority (overdue hint); saved locally |
| 🌤️ Weather | Free open-source Open-Meteo data, automatic IP geolocation |
| 📰 RSS feeds | Add / remove / reorder feeds; clicking a title marks it read; "Mark all read"; read state saved locally |
| 🐙 GitHub panel | Discover trending / new repos and Profile contribution graph; optional OAuth login raises the API quota from 60/hour to 5000/hour |
| 🗂️ Tab framework | Modules organized by tabs; toggle "Shortcuts ⇄ Tabs" from the sub-bar |
| 🕐 Clock & greeting | Real-time clock, date and time-of-day greeting (timezone selectable in settings) |
| ☀️ Light / dark | Toggle from the top-right icon |
| 🌐 Multi-language | Simplified Chinese / English, follows browser language by default (Settings → Language) |
| 🧘 Minimal mode | One click hides all panels, leaving only time, date and the search box — a truly minimal new tab |
| 🖼️ Custom background | Image / video background in minimal mode (local file or URL), adjustable scrim for text readability |

Data stays local (`chrome.storage.sync`); nothing is uploaded.

## Tech stack

**WXT + Vue 3 + TypeScript**

- [WXT](https://wxt.dev/)
- Vue 3 + Composition API
- TypeScript (zero type errors)

## Installation

1. Run `pnpm build`
2. Open Chrome and go to `chrome://extensions`
3. Enable Developer mode → Load unpacked → select `.output/chrome-mv3/`
4. Open a new tab to try it out

## Changelog

- **v0.5.0** (current): adds minimal mode (only time, date and search box; toggle in/out from the top-right) and custom background (shown only in minimal mode; image / video, local file or URL, adjustable scrim; video auto-pauses when hidden); UI i18n (Simplified Chinese / English, selectable in settings, follows browser language by default) — clock date, weather, GitHub activity and more switch with the language; settings drawer adds a theme segmented control, language and default search engine selection; the search bar uses a frosted-glass semi-transparent style in minimal mode
- **v0.4.0**: feed removal (hover ✕ on chip), Google Research switched to the official RSS feed with automatic migration; GitHub data 30-minute local cache + rate-limit state persistence — within the rate-limit window the new tab shows a countdown instead of firing invalid requests, with auto-retry after reset; bookmark split view (folder tree on the left + bookmarks on the right, toggled from the top-right icon, search works across views) with "Default order / Recently added" sorting; two-level site icon caching (memory + `chrome.storage.local`, deduped, capacity-capped); DuckDuckGo suggestion while typing (arrow-key selection, prefix cache); shortcut drag reorder and click-to-edit; to-dos with due dates and priority (overdue hint); RSS title click marks read, "Mark all read", read state persisted locally; optional GitHub OAuth login (Device Flow, token stored locally, quota 60/hour → 5000/hour); settings export / import; fixes for negative relative time, sub-bar and content column width misalignment, and more
- **v0.3.0**: initial release. WXT + Vue 3 + TypeScript from scratch: aggregated search, shortcuts, weather, to-dos, bookmark breadcrumb folder browsing, tab framework (Shortcuts ⇄ Tabs), RSS reader and GitHub Discover / Profile panels, light/dark theme

### Roadmap

- Interaction polish and performance optimization

## Privacy

- No data collection
- Weather, icons and suggestions use free public APIs
- Only three permissions: `storage`, `bookmarks`, `unlimitedStorage`
