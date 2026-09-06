<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../utils/i18n';
import { useRss } from '../composables/useRss';
import { useToast } from '../composables/useToast';
import SiteIcon from './SiteIcon.vue';

const { feeds, activeFeed, items, loading, error, refresh, selectFeed, addFeed, removeFeed, moveFeed, isRead, markRead, markAllRead } = useRss();
const { toast } = useToast();
const { t } = useI18n();

const addUrl = ref('');
const showAdd = ref(false);
const feedsEl = ref<HTMLElement | null>(null);

/* 订阅源 chip 拖拽排序 */
const dragId = ref<string | null>(null);
const dropTargetId = ref<string | null>(null);

/* 拖拽边缘自动滚动：指针靠近容器左右边缘时，行自动滚动，便于把源拖到最前/最后 */
const EDGE_ZONE = 48; // 触发自动滚动的边缘宽度（px）
let lastDragX = 0; // 拖拽中最近一次指针 X（非响应式，供 rAF 循环读取）
let scrollRaf = 0;

/** 找出指针下方的 chip 作为放置目标（滚动过程中 chip 会滑动到指针下，需逐帧重新判定） */
function updateDropTarget(clientX: number) {
  const el = feedsEl.value;
  if (!el || !dragId.value) return;
  const chips = Array.from(el.querySelectorAll<HTMLElement>('.rss-feed-chip'));
  for (const chip of chips) {
    const r = chip.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right) {
      const id = chip.dataset.id || '';
      dropTargetId.value = id && id !== dragId.value ? id : null;
      return;
    }
  }
  dropTargetId.value = null;
}

function onFeedsDragOver(e: DragEvent) {
  // 容器层：记录指针位置（chip 层的 dragover 负责 preventDefault 与高亮）
  lastDragX = e.clientX;
  updateDropTarget(lastDragX);
}

function startDragScroll() {
  cancelAnimationFrame(scrollRaf);
  const loop = () => {
    const el = feedsEl.value;
    if (!el || !dragId.value) {
      scrollRaf = 0;
      return;
    }
    updateDropTarget(lastDragX);
    const rect = el.getBoundingClientRect();
    // 按指针深入边缘的程度决定滚动速度（0~12px/帧）
    let step = 0;
    if (lastDragX < rect.left + EDGE_ZONE && el.scrollLeft > 0) {
      step = -((rect.left + EDGE_ZONE - lastDragX) / EDGE_ZONE) * 12;
    } else if (lastDragX > rect.right - EDGE_ZONE && el.scrollLeft < el.scrollWidth - el.clientWidth) {
      step = ((lastDragX - (rect.right - EDGE_ZONE)) / EDGE_ZONE) * 12;
    }
    if (step !== 0) {
      el.scrollLeft += step;
    }
    scrollRaf = requestAnimationFrame(loop);
  };
  scrollRaf = requestAnimationFrame(loop);
}

function stopDragScroll() {
  if (scrollRaf) {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
  }
}

function onChipDragStart(e: DragEvent, id: string) {
  dragId.value = id;
  lastDragX = e.clientX;
  startDragScroll();
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    // Firefox 需要设置数据才会启动拖拽
    e.dataTransfer.setData('text/plain', id);
  }
}

function onChipDragOver(e: DragEvent, id: string) {
  if (!dragId.value || dragId.value === id) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dropTargetId.value = id;
}

function onChipDrop(e: DragEvent, id: string) {
  if (!dragId.value || dragId.value === id) return;
  e.preventDefault();
  stopDragScroll();
  moveFeed(dragId.value, id);
  dragId.value = null;
  dropTargetId.value = null;
}

function onChipDragEnd() {
  stopDragScroll();
  dragId.value = null;
  dropTargetId.value = null;
}

/* 支持鼠标滚轮横向滚动订阅源 */
function onFeedsWheel(e: WheelEvent) {
  const el = feedsEl.value;
  if (!el) return;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (el.scrollWidth > el.clientWidth) {
    el.scrollLeft += delta;
    e.preventDefault();
  }
}

const isInitialLoad = computed(() => loading.value && items.value.length === 0);

function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  // 取绝对值：过去（正常）与未来（源站时钟偏差）的时间都显示为正数时长
  const seconds = Math.abs(Math.round((date.getTime() - Date.now()) / 1000));
  if (seconds < 60) return t('time.justNow');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('time.minAgo', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('time.hourAgo', { n: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t('time.dayAgo', { n: days });
  const months = Math.round(days / 30);
  return t('time.monthAgo', { n: months });
}

async function submitAdd() {
  const ok = await addFeed(addUrl.value);
  if (ok) {
    addUrl.value = '';
    showAdd.value = false;
    toast(t('rss.added'));
  }
}

async function onRemoveFeed(id: string) {
  if (feeds.value.length <= 1) {
    toast(t('rss.keepOne'));
    return;
  }
  const target = feeds.value.find((f) => f.id === id);
  await removeFeed(id);
  if (target) toast(t('rss.removed', { name: target.title }));
}
</script>

<template>
  <section class="card gh-card rss-card">
    <div class="card-head">
      <div class="head-text">
        <h2>{{ t('rss.title') }}</h2>
        <div class="card-sub">{{ activeFeed?.title || t('rss.feeds') }}</div>
      </div>
      <div class="rss-actions">
        <button class="icon-btn" :title="t('rss.refresh')" :disabled="loading" @click="refresh(true)">
          <svg :class="{ spinning: loading }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
        </button>
        <button class="icon-btn" :title="t('rss.add')" @click="showAdd = !showAdd">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 订阅源切换 chips（单行横向滚动，支持滚轮；可拖拽排序） -->
    <div ref="feedsEl" class="rss-feeds" @wheel.prevent="onFeedsWheel" @dragover="onFeedsDragOver">
      <button
        v-for="feed in feeds"
        :key="feed.id"
        class="rss-feed-chip"
        :data-id="feed.id"
        :class="{
          active: feed.id === activeFeed?.id,
          dragging: dragId === feed.id,
          'drop-target': dropTargetId === feed.id,
        }"
        :title="feed.url"
        draggable="true"
        @click="selectFeed(feed.id)"
        @dragstart="onChipDragStart($event, feed.id)"
        @dragover="onChipDragOver($event, feed.id)"
        @dragleave="dropTargetId = null"
        @drop="onChipDrop($event, feed.id)"
        @dragend="onChipDragEnd"
      >
        <span class="rss-chip-title">{{ feed.title }}</span>
        <span class="rss-chip-del" :title="t('rss.removeFeed')" draggable="false" @click.stop="onRemoveFeed(feed.id)">✕</span>
      </button>
    </div>

    <!-- 添加订阅源 -->
    <div v-if="showAdd" class="rss-add">
      <input
        v-model="addUrl"
        type="text"
        :placeholder="t('rss.addPlaceholder')"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter="submitAdd"
      />
      <button class="dark-btn" :disabled="loading" @click="submitAdd">{{ t('rss.addBtn') }}</button>
    </div>

    <div class="gh-scroll">
      <div v-if="isInitialLoad" class="rss-skeleton">
        <span v-for="n in 6" :key="'rs-' + n" class="rss-skel-row"></span>
      </div>

      <div v-else-if="error && items.length === 0" class="gh-message" role="status">
        <p>{{ error }}</p>
        <button class="text-btn" @click="refresh(true)">{{ t('rss.retry') }}</button>
      </div>

      <div v-else-if="items.length === 0" class="gh-empty-tip">{{ t('rss.empty') }}</div>

      <ul v-else class="rss-list">
        <li v-for="(item, idx) in items" :key="item.id">
          <a
            :href="item.link"
            target="_blank"
            rel="noreferrer"
            class="rss-item"
            :class="{ read: isRead(item.link) }"
            @click="markRead(item.link)"
          >
            <span class="rss-idx">{{ idx + 1 }}</span>
            <span class="rss-item-main">
              <span class="rss-item-title">{{ item.title }}</span>
              <span class="rss-item-desc">{{ item.description }}</span>
              <span class="rss-item-meta">
                <span v-if="item.author">{{ item.author }}</span>
                <time v-if="item.publishedAt">{{ relativeTime(item.publishedAt) }}</time>
              </span>
            </span>
          </a>
        </li>
      </ul>
    </div>

    <div class="gh-footer rss-footer">
      <span>{{ t('rss.footer', { n: feeds.length }) }}</span>
      <button v-if="items.length" class="text-btn" @click="markAllRead(items)">{{ t('rss.markAllRead') }}</button>
    </div>
  </section>
</template>