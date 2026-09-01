<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useGithubProfile, type ContributionDay } from '../composables/useGithub';
import { HEAT_RANGE_DAYS, formatCount, type HeatRange } from '../utils/common';
import { useSettings } from '../composables/useSettings';
import { K_GH_USER, storeGet, storeRemove, storeSet } from '../composables/useStorage';
import { useToast } from '../composables/useToast';

const { toast } = useToast();
const { settings } = useSettings();

const username = ref('');
const applied = ref<string | null>(null);
const heatRange = computed<HeatRange>(() => settings.ghHeatRange);
const { user, activities, contributions, loading, error, refresh, reset } = useGithubProfile(applied, heatRange);

const isRefreshing = computed(() => loading.value && !!user.value);

const HEAT_RANGE_TEXT: Record<HeatRange, string> = {
  quarter: '最近三个月',
  half: '最近半年',
  year: '过去一年',
  two: '最近两年',
  all: '全部历史',
};

/* ---------- 贡献热力图 ---------- */

interface HeatCell { date: string; count: number; level: number }
interface HeatWeek { cells: (HeatCell | null)[] }
interface HeatData {
  weeks: HeatWeek[];
  labels: { text: string; week: number }[];
  total: number;
}

/** 将按日期索引的贡献数据排布为 7 行（周日起始）的周网格，并给出月份标签与总数；范围由设置决定 */
const heat = computed<HeatData | null>(() => {
  const data = contributions.value;
  if (!data || !data.days.length) return null;

  const map = new Map<string, HeatCell>();
  for (const d of data.days) map.set(d.date, { date: d.date, count: d.count, level: d.level });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 起点：范围天数内的最早一天（全部历史则用数据最早一天），再对齐到所在周的周日
  const rangeDays = HEAT_RANGE_DAYS[heatRange.value];
  let start: Date;
  if (Number.isFinite(rangeDays)) {
    start = new Date(today);
    start.setDate(start.getDate() - (rangeDays - 1));
  } else {
    let earliest = data.days[0].date;
    for (const d of data.days) if (d.date < earliest) earliest = d.date;
    const [y, m, dd] = earliest.split('-').map(Number);
    start = new Date(y, m - 1, dd);
  }
  start.setDate(start.getDate() - start.getDay());

  const weeks: HeatWeek[] = [];
  const labels: { text: string; week: number }[] = [];
  let total = 0;

  for (let w = 0; ; w++) {
    if (w > 1100) break; // 防御上限（约 21 年）
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + w * 7);
    if (weekStart > today) break;
    const cells: (HeatCell | null)[] = [];
    for (let r = 0; r < 7; r++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + r);
      if (date > today) {
        cells.push(null);
        continue;
      }
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const day = map.get(key) || { date: key, count: 0, level: 0 };
      cells.push(day);
      total += day.count;
      // 该周包含当月 1 号时，在此列标注月份（一周最多含一个 1 号，无需去重）
      if (date.getDate() === 1) {
        labels.push({ text: `${date.getMonth() + 1}月`, week: w });
      }
    }
    weeks.push({ cells });
  }

  return { weeks, labels, total };
});

const tip = ref<{ x: number; y: number; text: string } | null>(null);

/** 热力图滚动容器：数据或范围变化后默认展示最新日期（滚到最右侧） */
const heatScrollEl = ref<HTMLElement | null>(null);

watch(heat, () => {
  nextTick(() => {
    const el = heatScrollEl.value;
    // 超出容器宽度时才有滚动；scrollLeft 超出上限会被自动钳制
    if (el) el.scrollLeft = el.scrollWidth;
  });
});

function showTip(event: MouseEvent, day: HeatCell | null) {
  if (!day) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  tip.value = {
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
    text: day.count > 0 ? `${day.date} · ${day.count} 次贡献` : `${day.date} · 无贡献`,
  };
}

function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  // 取绝对值：过去（正常）与未来（源站时钟偏差）的时间都显示为正数时长
  const seconds = Math.abs(Math.round((date.getTime() - Date.now()) / 1000));
  if (seconds < 60) return '刚刚';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.round(days / 30);
  return `${months} 个月前`;
}

async function view() {
  const login = username.value.trim();
  if (!login) {
    toast('请输入 GitHub 用户名');
    return;
  }
  applied.value = login;
  storeSet(K_GH_USER, login);
}

function unbind() {
  const login = applied.value;
  applied.value = null;
  username.value = '';
  reset();
  void storeRemove(K_GH_USER);
  toast(login ? `已解绑 @${login}` : '已解绑');
}

onMounted(async () => {
  const saved = await storeGet<string>(K_GH_USER, '');
  if (saved) {
    username.value = saved;
    applied.value = saved;
  }
});
</script>

<template>
  <section class="card gh-card gh-profile">
    <div class="card-head">
      <div class="head-text">
        <h2>GitHub Profile</h2>
        <div class="card-sub">公开资料与最近动态 · 无需登录</div>
      </div>
      <div v-if="applied" class="gh-controls">
        <button class="icon-btn small" title="刷新（获取最新数据）" :disabled="loading" @click="refresh(true)">
          <svg :class="{ spinning: isRefreshing }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
        </button>
        <button class="text-btn gh-unbind" title="清除已绑定的用户，回到初始状态" @click="unbind">解绑</button>
      </div>
    </div>

    <div v-if="!applied" class="field-row gh-user-row">
      <input
        v-model="username"
        type="text"
        placeholder="输入用户名"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter="view"
      />
      <button class="dark-btn" :disabled="loading" @click="view">查看</button>
    </div>

    <div class="gh-scroll">
      <template v-if="user">
        <div class="gh-identity">
          <a :href="user.profileUrl" target="_blank" rel="noreferrer" class="gh-avatar">
            <img :src="user.avatarUrl" :alt="user.login + '的头像'" width="56" height="56" loading="lazy" />
          </a>
          <div class="gh-identity-copy">
            <h3>{{ user.name }}</h3>
            <a :href="user.profileUrl" target="_blank" rel="noreferrer">@{{ user.login }}</a>
            <p v-if="user.bio" class="gh-bio">{{ user.bio }}</p>
            <p v-if="user.company || user.location" class="gh-meta-line">
              <span v-if="user.company">{{ user.company }}</span>
              <span v-if="user.company && user.location"> · </span>
              <span v-if="user.location">{{ user.location }}</span>
            </p>
          </div>
        </div>

        <dl class="gh-stats">
          <div>
            <dt>Followers</dt>
            <dd>{{ formatCount(user.followers) }}</dd>
          </div>
          <div>
            <dt>Following</dt>
            <dd>{{ formatCount(user.following) }}</dd>
          </div>
          <div>
            <dt>Repos</dt>
            <dd>{{ formatCount(user.publicRepos) }}</dd>
          </div>
        </dl>

        <div v-if="heat" class="gh-heat" :class="{ 'gh-heat-lg': settings.ghHeatRange === 'quarter' }">
          <div class="gh-heat-head">
            <h4 class="gh-section-title">贡献热力图</h4>
            <span class="gh-heat-total">{{ heat.total.toLocaleString() }} 次贡献 · {{ HEAT_RANGE_TEXT[settings.ghHeatRange] }}</span>
          </div>
          <div class="gh-heat-graph" @mouseleave="tip = null">
            <div class="gh-heat-weekdays" aria-hidden="true">
              <span></span><span>周一</span><span></span><span>周三</span><span></span><span>周五</span><span></span>
            </div>
            <div class="gh-heat-main" ref="heatScrollEl">
              <div class="gh-heat-months" :style="{ '--heat-cols': heat.weeks.length }">
                <span v-for="l in heat.labels" :key="l.text" class="gh-heat-month" :style="{ gridColumnStart: l.week + 1 }">{{ l.text }}</span>
              </div>
              <div class="gh-heat-cal" :style="{ '--heat-cols': heat.weeks.length }">
                <template v-for="(week, wi) in heat.weeks" :key="wi">
                  <span
                    v-for="(day, ri) in week.cells"
                    :key="wi + '-' + ri"
                    class="gh-heat-cell"
                    :class="day ? 'gh-heat-lv' + day.level : ''"
                    @mouseenter="showTip($event, day)"
                  ></span>
                </template>
              </div>
            </div>
          </div>
          <div class="gh-heat-legend">
            <span>少</span>
            <i class="gh-heat-cell gh-heat-lv0"></i>
            <i class="gh-heat-cell gh-heat-lv1"></i>
            <i class="gh-heat-cell gh-heat-lv2"></i>
            <i class="gh-heat-cell gh-heat-lv3"></i>
            <i class="gh-heat-cell gh-heat-lv4"></i>
            <span>多</span>
          </div>
        </div>

        <h4 class="gh-section-title">最近动态</h4>
        <ul v-if="activities.length" class="gh-activity">
          <li v-for="item in activities" :key="item.id">
            <a :href="item.url" target="_blank" rel="noreferrer" class="gh-activity-link">
              <span class="gh-activity-dot" aria-hidden="true"></span>
              <span class="gh-activity-copy">
                <strong>{{ item.action }}</strong>
                <span class="gh-activity-subject">{{ item.subject }}</span>
                <time>{{ relativeTime(item.createdAt) }}</time>
              </span>
            </a>
          </li>
        </ul>
        <p v-else-if="!loading" class="gh-empty-tip">{{ error ? '' : '该用户暂无公开动态' }}</p>
      </template>

      <div v-else-if="loading" class="gh-empty-tip">正在加载 @{{ applied }} 的资料…</div>
      <div v-else-if="error" class="gh-message" role="status">
        <p>{{ error }}</p>
        <button class="text-btn" @click="refresh(true)">重试</button>
      </div>
      <div v-else class="gh-empty-tip">
        <p>输入 GitHub 用户名，查看公开资料与最近动态</p>
        <p class="gh-empty-sub">数据来自 GitHub 公开 REST API，无需登录</p>
      </div>
    </div>
  </section>

  <Teleport to="body">
    <div v-if="tip" class="gh-heat-tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
  </Teleport>
</template>