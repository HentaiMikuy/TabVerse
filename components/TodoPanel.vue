<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Todo } from '../utils/common';
import { K_TODOS, storeGet, storeSet } from '../composables/useStorage';
import { useToast } from '../composables/useToast';

const { toast } = useToast();
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
  const parts = [`共 ${todos.value.length} 项`, `未完成 ${undone.value} 项`];
  if (overdue.value) parts.push(`逾期 ${overdue.value} 项`);
  return parts.join(' · ');
});

const PRIORITY_TEXT = ['低', '中', '高'];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDue(due: string): string {
  const [y, m, d] = due.split('-').map(Number);
  const label = `${m}月${d}日`;
  if (due === todayStr()) return '今天';
  return label;
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
    toast('没有已完成的待办');
    return;
  }
  todos.value = kept;
  save();
  toast('已清除完成的待办');
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
        <h2>待办事项</h2>
        <div class="card-sub">支持截止日期与优先级</div>
      </div>
      <span class="badge">{{ undone }}</span>
    </div>
    <button class="todo-add-strip" @click="openModal">＋ 添加待办</button>
    <ul class="todo-list">
      <li v-if="!todos.length" class="todo-empty">暂无待办，添加一条开始今天吧 ✨</li>
      <li v-for="(todo, idx) in todos" :key="todo.id">
        <button
          class="todo-check"
          :class="{ done: todo.done }"
          :title="todo.done ? '标记为未完成' : '标记为已完成'"
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
        <button class="todo-del" title="删除" @click="removeTodo(idx)">✕</button>
      </li>
    </ul>
    <div class="list-foot todo-foot">
      <span>{{ footText }}</span>
      <button class="text-btn" @click="clearDone">清除已完成</button>
    </div>
  </div>

  <!-- 添加待办弹窗（挂到 body，避免被内容列容器裁剪/错位） -->
  <Teleport to="body">
    <div class="modal-backdrop" :class="{ hidden: !modalOpen }" @click="onModalBackdropClick">
      <div class="modal">
        <h3>添加待办</h3>
        <label class="field"
          >内容
          <input
            ref="textInput"
            v-model="formText"
            type="text"
            placeholder="要做什么…"
            autocomplete="off"
            @keydown.enter="saveModal"
          />
        </label>
        <div class="modal-row">
          <label class="field"
            >截止日期
            <input v-model="formDue" type="date" title="截止日期（可选）" />
          </label>
          <label class="field"
            >优先级
            <select v-model="formPrio">
              <option :value="0">低</option>
              <option :value="1">中</option>
              <option :value="2">高</option>
            </select>
          </label>
        </div>
        <div class="modal-actions">
          <button class="text-btn" @click="closeModal">取消</button>
          <button class="dark-btn" @click="saveModal">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
