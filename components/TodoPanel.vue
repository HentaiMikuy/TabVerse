<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Todo } from '../utils/common';
import { K_TODOS, storeGet, storeSet } from '../composables/useStorage';
import { useToast } from '../composables/useToast';

const { toast } = useToast();
const todos = ref<Todo[]>([]);
const input = ref('');
const dueInput = ref('');
const priority = ref(1); // 0=低 1=中 2=高

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

function addTodo() {
  const text = input.value.trim();
  if (!text) return;
  todos.value.unshift({
    id: Date.now(),
    text,
    done: false,
    due: dueInput.value || undefined,
    priority: priority.value,
  });
  input.value = '';
  dueInput.value = '';
  priority.value = 1;
  save();
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
});
</script>

<template>
  <div class="card todo-card">
    <div class="card-head">
      <div class="head-text">
        <h2>待办事项</h2>
        <div class="card-sub">回车快速添加</div>
      </div>
      <span class="badge">{{ undone }}</span>
    </div>
    <form class="todo-input-row" @submit.prevent="addTodo">
      <input v-model="input" class="line-input todo-input" type="text" placeholder="添加待办…" autocomplete="off" />
      <input v-model="dueInput" class="todo-due" type="date" title="截止日期" />
      <select v-model="priority" class="todo-prio" title="优先级" @keydown.enter="addTodo">
        <option :value="0">低</option>
        <option :value="1">中</option>
        <option :value="2">高</option>
      </select>
      <button type="submit" class="dark-btn todo-add-btn" title="添加待办">添加</button>
    </form>
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
</template>
