<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Todo, TodoSort } from '../utils/common';
import { useI18n } from '../utils/i18n';
import { K_TODOS, asArray, storeGet, storeSet } from '../composables/useStorage';
import { useToast } from '../composables/useToast';
import { useSettings } from '../composables/useSettings';

const { toast } = useToast();
const { t } = useI18n();
const { settings } = useSettings();
const todos = ref<Todo[]>([]);

/* 添加/编辑待办弹窗（editingId 为 null 时是「添加」模式，否则编辑该条待办） */
const modalOpen = ref(false);
const editingId = ref<number | null>(null);
const formText = ref('');
const formDue = ref('');
const formPrio = ref(1); // 0=低 1=中 2=高
const textInput = ref<HTMLInputElement>();

const isEditing = computed(() => editingId.value !== null);
const modalTitle = computed(() => (isEditing.value ? t('todo.editModal') : t('todo.addModal')));

const undone = computed(() => todos.value.filter((t) => !t.done).length);
const overdue = computed(() => todos.value.filter((t) => !t.done && t.due && daysFromToday(t.due) < 0).length);
const footText = computed(() => {
  if (!todos.value.length) return '';
  const parts = [t('todo.footTotal', { n: todos.value.length }), t('todo.footUndone', { n: undone.value })];
  if (overdue.value) parts.push(t('todo.footOverdue', { n: overdue.value }));
  return parts.join(' · ');
});

const PRIORITY_TEXT = computed(() => [t('todo.prio0'), t('todo.prio1'), t('todo.prio2')]);

const DAY_MS = 86400000;

/**
 * 把截止日期解析成「当天零点」的 UTC 时间戳：用 UTC 算天数差，避开时区偏移与夏令时导致的 ±1 天误差。
 * 越界日期（2026-02-30、2026-13-01 等）会被 Date.UTC 静默归一化到下个月/下一年，回读校验不一致即视为非法，返回 NaN
 */
function dueStamp(due: string): number {
  const [y, m, d] = due.split('-').map(Number);
  if (!y || !m || !d) return NaN;
  const stamp = Date.UTC(y, m - 1, d);
  const dt = new Date(stamp);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return NaN;
  return stamp;
}

function todayStamp(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

/** 相对今天的天数：正数=还剩几天，负数=已逾期几天，0=今天 */
function daysFromToday(due: string): number {
  return Math.round((dueStamp(due) - todayStamp()) / DAY_MS);
}

/** 完整日期（带年份），用作悬浮提示，任何简写形式都能在此核对；越界日期原样返回 */
function fmtFullDue(due: string): string {
  const [y, m, d] = due.split('-').map(Number);
  if (!Number.isFinite(dueStamp(due))) return due;
  return t('todo.dueFull', { y, m, d });
}

/**
 * 日期标签的显示策略（按「距今天数」分档，越近越强调紧迫感）：
 * - 今天 / 明天 / 后天 → 相对描述，最直观
 * - 3~5 天 → 「仅剩 N 天」：临近截止时倒计时比「几月几号」更能看出还剩几天
 * - 今年内的更远日期 → 只显示「月日」（不会和今年混淆）
 * - 非今年：只显示「月日」会被误读成今年，所以一年内改显示「还剩 N 天」；
 *   更远的日期用带年份的完整日期，避免出现「还剩 800 天」这种不好换算的数字
 * - 逾期：一年内显示「已逾期 N 天」，超过一年用带年份的完整日期（与远期日期对称）
 */
function fmtDue(due: string): string {
  const [y, m, d] = due.split('-').map(Number);
  if (!y || !m || !d) return due;
  const days = daysFromToday(due);
  if (!Number.isFinite(days)) return due; // 越界日期原样显示，避免出现「13月1日」这类假日期
  if (days === 0) return t('todo.today');
  if (days === 1) return t('todo.tomorrow');
  if (days === 2) return t('todo.dayAfter');
  if (days > 0) {
    if (days <= 5) return t('todo.daysLeftSoon', { n: days });
    if (y === new Date().getFullYear()) return t('todo.dueFormat', { m, d });
    if (days <= 365) return t('todo.daysLeft', { n: days });
    return fmtFullDue(due);
  }
  if (-days <= 365) return t('todo.overdueBy', { n: -days });
  return fmtFullDue(due); // 超过一年的逾期项带上年份，避免「已逾期 800 天」这种数字
}

/* ---------------- 排序：默认按添加时间，可切换为截止日期优先 ---------------- */

const sortMode = computed<TodoSort>(() => (settings.todoSort === 'due' ? 'due' : 'added'));
const sortTip = computed(() => (sortMode.value === 'due' ? t('todo.sortTipDue') : t('todo.sortTipAdded')));

function toggleSort() {
  const next: TodoSort = sortMode.value === 'due' ? 'added' : 'due';
  settings.todoSort = next;
  toast(t('todo.sortNow', { mode: t(next === 'due' ? 'todo.sortDue' : 'todo.sortAdded') }));
}

/**
 * 列表显示顺序（只影响渲染，不改存储顺序，随时能切回「最近添加」）：
 * - added：存储顺序即添加时间倒序（新添加的 unshift 在最前）
 * - due：未完成且未逾期按剩余天数升序（最临近的在上）→ 无截止日期按添加时间 →
 *   已逾期按逾期天数（逾期越久越靠下）→ 已完成置底；同组内保持添加顺序（sort 稳定）
 */
const sortedTodos = computed<Todo[]>(() => {
  if (sortMode.value === 'added') return todos.value;
  const rankById = new Map<number, number>();
  const daysById = new Map<number, number>();
  for (const todo of todos.value) {
    let days: number | null = null;
    if (todo.due) {
      const parsed = daysFromToday(todo.due);
      if (Number.isFinite(parsed)) days = parsed; // 非法日期字符串按「无截止日期」处理，不参与天数差排序
    }
    if (days !== null) daysById.set(todo.id, days);
    let rank = 1; // 1=无截止日期
    if (todo.done) rank = 3; // 3=已完成
    else if (days !== null) rank = days >= 0 ? 0 : 2; // 0=临近，2=已逾期
    rankById.set(todo.id, rank);
  }
  return [...todos.value].sort((a, b) => {
    const rank = rankById.get(a.id) ?? 0;
    const rankDiff = rank - (rankById.get(b.id) ?? 0);
    if (rankDiff) return rankDiff;
    if (rank === 1 || rank === 3) return 0; // 无截止日期 / 已完成：保持添加顺序
    const daysDiff = (daysById.get(a.id) ?? 0) - (daysById.get(b.id) ?? 0);
    return rank === 2 ? -daysDiff : daysDiff; // 逾期组反向：剩余天数越负（逾期越久）越靠下
  });
});

function save() {
  storeSet(K_TODOS, todos.value);
}

/** 生成不与现有待办重复的 id：同一毫秒内连续添加时 Date.now() 会撞号，编辑按 id 定位就会改错条目 */
function nextId(): number {
  const used = new Set(todos.value.map((item) => item.id));
  let id = Date.now();
  while (used.has(id)) id += 1;
  return id;
}

function openModal() {
  editingId.value = null;
  formText.value = '';
  formDue.value = '';
  formPrio.value = 1;
  modalOpen.value = true;
  setTimeout(() => textInput.value?.focus());
}

/** 二次修改：把已有待办的内容 / 截止日期 / 优先级回填到弹窗 */
function openEditModal(todo: Todo) {
  editingId.value = todo.id;
  formText.value = todo.text;
  formDue.value = todo.due ?? '';
  formPrio.value = todo.priority ?? 1;
  modalOpen.value = true;
  setTimeout(() => {
    textInput.value?.focus();
    textInput.value?.select();
  });
}

function closeModal() {
  modalOpen.value = false;
}

function saveModal() {
  const text = formText.value.trim();
  if (!text) return;
  const fields = { text, due: formDue.value || undefined, priority: formPrio.value };
  if (editingId.value !== null) {
    const target = todos.value.find((item) => item.id === editingId.value);
    if (!target) return; // 编辑期间该条已被删除，直接放弃修改
    // 只改内容/日期/优先级，保留完成状态与所在位置
    Object.assign(target, fields);
    save();
    closeModal();
    toast(t('todo.updated'));
    return;
  }
  todos.value.unshift({ id: nextId(), done: false, ...fields });
  save();
  closeModal();
}

function onModalBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) closeModal();
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && modalOpen.value) closeModal();
}

function toggleTodo(todo: Todo) {
  todo.done = !todo.done;
  save();
}

/** 按 id 删除：列表按排序规则重排后下标不再对应存储位置，用下标会删错条目 */
function removeTodo(id: number) {
  todos.value = todos.value.filter((item) => item.id !== id);
  save();
}

function clearDone() {
  const kept = todos.value.filter((t) => !t.done);
  if (kept.length === todos.value.length) {
    toast(t('todo.noneDone'));
    return;
  }
  todos.value = kept;
  save();
  toast(t('todo.cleared'));
}

onMounted(async () => {
  todos.value = asArray<Todo>(await storeGet<Todo[] | Record<string, Todo> | null>(K_TODOS, []));
  document.addEventListener('keydown', onDocKeydown);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onDocKeydown));
</script>

<template>
  <div class="card todo-card">
    <div class="card-head">
      <div class="head-text">
        <h2>{{ t('todo.title') }}</h2>
        <div class="card-sub">{{ t('todo.sub') }}</div>
      </div>
      <div class="head-actions">
        <button
          class="icon-btn small todo-sort"
          :title="sortTip"
          :aria-label="sortTip"
          :aria-pressed="sortMode === 'due'"
          @click="toggleSort"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 4v16M7 20l-3-3M7 20l3-3" />
            <path d="M17 20V4M17 4l-3 3M17 4l3 3" />
          </svg>
        </button>
        <span class="badge">{{ undone }}</span>
      </div>
    </div>
    <button class="todo-add-strip" @click="openModal">{{ t('todo.add') }}</button>
    <ul class="todo-list">
      <li v-if="!todos.length" class="todo-empty">{{ t('todo.empty') }}</li>
      <li v-for="todo in sortedTodos" :key="todo.id">
        <button
          class="todo-check"
          :class="{ done: todo.done }"
          :title="todo.done ? t('todo.markUndone') : t('todo.markDone')"
          @click="toggleTodo(todo)"
        >
          ✓
        </button>
        <span
          class="todo-text"
          :class="{ done: todo.done }"
          :title="t('todo.editHint')"
          @dblclick="openEditModal(todo)"
        >{{ todo.text }}</span>
        <span v-if="todo.priority != null && todo.priority !== 1" class="todo-prio-chip" :class="'p' + todo.priority">
          {{ PRIORITY_TEXT[todo.priority] }}
        </span>
        <span
          v-if="todo.due"
          class="todo-due-chip"
          :class="{ overdue: !todo.done && daysFromToday(todo.due) < 0 }"
          :title="fmtFullDue(todo.due)"
        >
          {{ fmtDue(todo.due) }}
        </span>
        <span class="todo-acts">
          <button class="todo-edit" :title="t('todo.edit')" @click="openEditModal(todo)">✎</button>
          <button class="todo-del" :title="t('subbar.delete')" @click="removeTodo(todo.id)">✕</button>
        </span>
      </li>
    </ul>
    <div class="list-foot todo-foot">
      <span>{{ footText }}</span>
      <button class="text-btn" @click="clearDone">{{ t('todo.clearDone') }}</button>
    </div>
  </div>

  <!-- 添加/编辑待办弹窗（挂到 body，避免被内容列容器裁剪/错位） -->
  <Teleport to="body">
    <div class="modal-backdrop" :class="{ hidden: !modalOpen }" @click="onModalBackdropClick">
      <div class="modal">
        <h3>{{ modalTitle }}</h3>
        <label class="field"
          >{{ t('todo.content') }}
          <input
            ref="textInput"
            v-model="formText"
            type="text"
            :placeholder="t('todo.contentPlaceholder')"
            autocomplete="off"
            @keydown.enter="saveModal"
          />
        </label>
        <div class="modal-row">
          <label class="field"
            >{{ t('todo.due') }}
            <input v-model="formDue" type="date" :title="t('todo.dueTitle')" />
          </label>
          <label class="field"
            >{{ t('todo.priority') }}
            <select v-model="formPrio">
              <option :value="0">{{ t('todo.prio0') }}</option>
              <option :value="1">{{ t('todo.prio1') }}</option>
              <option :value="2">{{ t('todo.prio2') }}</option>
            </select>
          </label>
        </div>
        <div class="modal-actions">
          <button class="text-btn" @click="closeModal">{{ t('subbar.cancel') }}</button>
          <button class="dark-btn" @click="saveModal">{{ t('subbar.save') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
