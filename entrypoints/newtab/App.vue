<script setup lang="ts">
import { ref } from 'vue';
import TopBar from '../../components/TopBar.vue';
import SearchBar from '../../components/SearchBar.vue';
import SubBar from '../../components/SubBar.vue';
import BookmarkPanel from '../../components/BookmarkPanel.vue';
import TodoPanel from '../../components/TodoPanel.vue';
import RepositoryPanel from '../../components/RepositoryPanel.vue';
import GithubProfilePanel from '../../components/GithubProfilePanel.vue';
import RssPanel from '../../components/RssPanel.vue';
import SettingsDrawer from '../../components/SettingsDrawer.vue';
import ToastBox from '../../components/ToastBox.vue';
import BackgroundLayer from '../../components/BackgroundLayer.vue';
import MinimalView from '../../components/MinimalView.vue';
import { useTabs } from '../../composables/useTabs';
import { useSettings } from '../../composables/useSettings';

const { activeTab } = useTabs();
const { settings, ready } = useSettings();
const drawerOpen = ref(false);
</script>

<template>
  <BackgroundLayer />

  <!-- 等设置加载完成再决定布局，避免简约模式切换时整页闪一下 -->
  <template v-if="ready">
    <MinimalView v-if="settings.minimal" @open-settings="drawerOpen = true" />
    <template v-else>
      <TopBar @open-settings="drawerOpen = true" />

      <main class="page">
        <section class="search-wrap">
          <SearchBar />
          <SubBar />
        </section>

        <!-- 标签页：主页（书签 + 待办 双栏） -->
        <div v-show="activeTab === 'home'" class="tab-panel" :class="{ active: activeTab === 'home' }">
          <section class="cols">
            <BookmarkPanel />
            <TodoPanel />
          </section>
        </div>

        <!-- 标签页：GitHub（RSS 阅读 + 热库 + Profile 三栏布局，参考 XTab） -->
        <div v-show="activeTab === 'github'" class="tab-panel" :class="{ active: activeTab === 'github' }">
          <section class="gh-cols">
            <RssPanel />
            <RepositoryPanel />
            <GithubProfilePanel />
          </section>
        </div>
        <!-- 未来标签页（RSS 等）注册到 useTabs 的 TABS 后在此添加对应面板 -->
      </main>
    </template>
  </template>

  <SettingsDrawer :open="drawerOpen" @close="drawerOpen = false" />
  <ToastBox />
</template>
