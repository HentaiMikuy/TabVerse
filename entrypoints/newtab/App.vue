<script setup lang="ts">
import { ref, watchEffect } from 'vue';
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
import { useI18n } from '../../utils/i18n';

const { activeTab } = useTabs();
const { settings, loaded } = useSettings();
const { t } = useI18n();
const drawerOpen = ref(false);

// 页面标题随语言更新（index.html 默认 zh-CN）
watchEffect(() => {
  document.title = t('app.title');
});
</script>

<template>
  <BackgroundLayer />

  <!-- 等设置加载完成再决定布局，避免简约模式下打开新标签页先闪现普通模式 -->
  <template v-if="loaded">
    <Transition name="mode" mode="out-in">
      <MinimalView
        v-if="settings.minimal"
        key="minimal"
        @open-settings="drawerOpen = true"
      />
      <div v-else key="normal" class="layout-normal">
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
      </div>
    </Transition>
  </template>

  <SettingsDrawer :open="drawerOpen" @close="drawerOpen = false" />
  <ToastBox />
</template>
