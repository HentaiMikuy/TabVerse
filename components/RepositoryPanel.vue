<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../utils/i18n';
import {
  GITHUB_LANGUAGES,
  githubTrendingPageUrl,
  useGithubRepos,
  type GithubPeriod,
  type GithubSort,
} from '../composables/useGithub';
import RepositoryCard from './RepositoryCard.vue';

const { t } = useI18n();
const language = ref('all');
const period = ref<GithubPeriod>('weekly');
const sort = ref<GithubSort>('popular');
const { repos, loading, error, refresh } = useGithubRepos(language, period, sort);

const isInitialLoad = computed(() => loading.value && repos.value.length === 0);
const isRefreshing = computed(() => loading.value && repos.value.length > 0);

const periodOptions = computed<{ value: GithubPeriod; label: string }[]>(() => [
  { value: 'daily', label: t('repo.today') },
  { value: 'weekly', label: t('repo.week') },
  { value: 'monthly', label: t('repo.month') },
]);

const sortOptions = computed<{ value: GithubSort; label: string }[]>(() => [
  { value: 'popular', label: 'Popular' },
  { value: 'new', label: 'New' },
]);

const externalUrl = computed(() => githubTrendingPageUrl(language.value, period.value));
</script>

<template>
  <section class="card gh-card">
    <div class="card-head">
      <div class="head-text">
        <h2>{{ t('repo.title') }}</h2>
        <div class="card-sub">{{ t('repo.sub') }}</div>
      </div>
      <div class="gh-controls">
        <select v-model="sort" class="gh-select" :aria-label="t('repo.sortLabel')">
          <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <select v-model="period" class="gh-select" :aria-label="t('repo.periodLabel')">
          <option v-for="opt in periodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <select v-model="language" class="gh-select" :aria-label="t('repo.langLabel')">
          <option v-for="lang in GITHUB_LANGUAGES" :key="lang" :value="lang">{{ lang === 'all' ? t('repo.allLanguages') : lang }}</option>
        </select>
        <button class="icon-btn" :title="t('rss.refresh')" :disabled="loading" @click="refresh(true)">
          <svg :class="{ spinning: isRefreshing }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
        </button>
      </div>
    </div>

    <div class="gh-scroll">
      <!-- 首屏骨架 -->
      <div v-if="isInitialLoad" class="repo-grid" :aria-label="t('repo.loading')">
        <div v-for="n in 6" :key="'sk-' + n" class="repo-card repo-skeleton">
          <span class="repo-skel-line repo-skel-line--1"></span>
          <span class="repo-skel-line repo-skel-line--2"></span>
          <span class="repo-skel-line repo-skel-line--3"></span>
        </div>
      </div>

      <!-- 错误（仅当无数据时） -->
      <div v-else-if="error && repos.length === 0" class="gh-message" role="status">
        <p>{{ error }}</p>
        <button class="text-btn" @click="refresh(true)">{{ t('repo.retry') }}</button>
      </div>

      <!-- 成功列表 -->
      <div v-else class="repo-grid">
        <RepositoryCard v-for="repo in repos" :key="repo.id" :repo="repo" />
      </div>
    </div>

    <a class="gh-footer" :href="externalUrl" target="_blank" rel="noreferrer">
      <span>{{ t('repo.viewAll') }}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 17 17 7M8 7h9v9" />
      </svg>
    </a>
  </section>
</template>