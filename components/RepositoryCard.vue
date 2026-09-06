<script setup lang="ts">
import { formatCount } from '../utils/common';
import { useI18n } from '../utils/i18n';
import type { TrendingRepo } from '../composables/useGithub';

defineProps<{ repo: TrendingRepo }>();
const { t } = useI18n();
</script>

<template>
  <article class="repo-card" :style="{ '--repo-accent': repo.accent }">
    <a :href="repo.url" target="_blank" rel="noreferrer" class="repo-card-link">
      <div class="repo-card-top">
        <span class="repo-lang-dot" :style="{ background: repo.accent }" aria-hidden="true"></span>
        <h3 class="repo-card-title">{{ repo.name }}</h3>
      </div>
      <p class="repo-card-desc" :title="repo.description">{{ repo.description || t('repo.noDesc') }}</p>
      <div class="repo-card-meta">
        <span class="repo-card-lang">{{ repo.language }}</span>
        <span class="repo-card-stats">
          <span class="repo-card-stat" title="Stars">★ {{ formatCount(repo.stars) }}</span>
          <span class="repo-card-stat" title="Forks">⑂ {{ formatCount(repo.forks) }}</span>
        </span>
      </div>
    </a>
  </article>
</template>