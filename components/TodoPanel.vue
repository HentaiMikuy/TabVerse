<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Todo } from '../utils/common';
import { K_TODOS, storeGet, storeSet } from '../composables/useStorage';
import { useToast } from '../composables/useToast';

const { toast } = useToast();
const todos = ref<Todo[]>([]);
const input = ref('');

const undone = computed(() => todos.value.filter((t) => !t.done).length);
const footText = computed(() => (todos.value.length ? `共 ${todos.value.length} 项 · 未完成 ${undone.value} 项` : ''));

function save() {
  storeSet(K_TODOS, todos.value);
}

function addTodo() {
  const text = input.value.trim();
  if (!text) return;
  todos.value.unshift({ id: Date.now(), text, done: false });
  input.value = '';
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
    <input v-model="input" class="line-input" type="text" placeholder="添加待办…" autocomplete="off" @keydown.enter="addTodo" />
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
        <button class="todo-del" title="删除" @click="removeTodo(idx)">✕</button>
      </li>
    </ul>
    <div class="list-foot todo-foot">
      <span>{{ footText }}</span>
      <button class="text-btn" @click="clearDone">清除已完成</button>
    </div>
  </div>
</template>
