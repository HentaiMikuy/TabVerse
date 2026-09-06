<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Todo } from '../utils/common';
import { useI18n } from '../utils/i18n';
import { K_TODOS, storeGet, storeSet } from '../composables/useStorage';
import { useToast } from '../composables/useToast';

const { toast } = useToast();
const { t } = useI18n();
const todos = ref<Todo[]>([]);

/* 添加待办弹窗 */
const modalOpen = ref(false);
const formText = ref('');
const formDue = ref('');
const formPrio = ref(1); // 0=低 1=中 2=高
const textInput = ref<HTMLInputElement>();

const undone = computed(() => todos.value.filter((t) => !t.done).length);
const overdue = computed(() => {
  const today = todayStr();
  return todos.value.filter((t) => !t.done && t.due && t.due < today).length;
});
const footText = computed(() => {
  if (!todos.value.length) return '';
  const parts = [t('todo.footTotal', { n: todos.value.length }), t('todo.footUndone', { n: undone.value })];
  if (overdue.value) parts.push(t('todo.footOverdue', { n: overdue.value }));
  return parts.join(' · ');
});

const PRIORITY_TEXT = computed(() => [t('todo.prio0'), t('todo.prio1'), t('todo.prio2')]);

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDue(due: string): string {
  const [y, m, d] = due.split('-').map(Number);
  if (due === todayStr()) return t('todo.today');
  return t('todo.dueFormat', { m, d });
}

function save() {
  storeSet(K_TODOS, todos.value);
}

function openModal() {
  formText.value = '';
  formDue.value = '';
  formPrio.value = 1;
  modalOpen.value = true;
  setTimeout(() => textInput.value?.focus());
}

function closeModal() {
  modalOpen.value = false;
}

function saveModal() {
  const text = formText.value.trim();
  if (!text) return;
  todos.value.unshift({
    id: Date.now(),
    text,
    done: false,
    due: formDue.value || undefined,
    priority: formPrio.value,
  });
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

function removeTodo(idx: number) {
  todos.value.splice(idx, 1);
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
  todos.value = await storeGet<Todo[]>(K_TODOS, []);
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
      <span class="badge">{{ undone }}</span>
    </div>
    <button class="todo-add-strip" @click="openModal">{{ t('todo.add') }}</button>
    <ul class="todo-list">
      <li v-if="!todos.length" class="todo-empty">{{ t('todo.empty') }}</li>
      <li v-for="(todo, idx) in todos" :key="todo.id">
        <button
          class="todo-check"
          :class="{ done: todo.done }"
          :title="todo.done ? t('todo.markUndone') : t('todo.markDone')"
          @click="toggleTodo(todo)"
        >
          ✓
        </button>
        <span class="todo-text" :class="{ done: todo.done }">{{ todo.text }}</span>
        <span v-if="todo.priority != null && todo.priority !== 1" class="todo-prio-chip" :class="'p' + todo.priority">
          {{ PRIORITY_TEXT[todo.priority] }}
        </span>
        <span
          v-if="todo.due"
          class="todo-due-chip"
          :class="{ overdue: !todo.done && todo.due < todayStr() }"
        >
          {{ fmtDue(todo.due) }}
        </span>
        <button class="todo-del" :title="t('subbar.delete')" @click="removeTodo(idx)">✕</button>
      </li>
    </ul>
    <div class="list-foot todo-foot">
      <span>{{ footText }}</span>
      <button class="text-btn" @click="clearDone">{{ t('todo.clearDone') }}</button>
    </div>
  </div>

  <!-- 添加待办弹窗（挂到 body，避免被内容列容器裁剪/错位） -->
  <Teleport to="body">
    <div class="modal-backdrop" :class="{ hidden: !modalOpen }" @click="onModalBackdropClick">
      <div class="modal">
        <h3>{{ t('todo.addModal') }}</h3>
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
