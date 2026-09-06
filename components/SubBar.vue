<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DEFAULT_LINKS, normalizeUrl, type QuickLink } from '../utils/common';
import { useI18n } from '../utils/i18n';
import { K_LINKS, storeGet, storeSet } from '../composables/useStorage';
import { useTabs, TABS } from '../composables/useTabs';
import { useToast } from '../composables/useToast';
import SiteIcon from './SiteIcon.vue';

const { activeTab, subbarView, switchTab, toggleSubbar } = useTabs();
const { toast } = useToast();
const { t } = useI18n();

const links = ref<QuickLink[]>([]);
const editMode = ref(false);

/* 拖拽排序 */
const dragIdx = ref<number | null>(null);
const dropIdx = ref<number | null>(null);

/* 添加/编辑弹窗状态 */
const modalOpen = ref(false);
const editingIndex = ref(-1);
const formName = ref('');
const formUrl = ref('');
const urlInput = ref<HTMLInputElement>();

watch(editMode, (on) => document.body.classList.toggle('edit-mode', on));

async function loadLinks() {
  const stored = await storeGet<QuickLink[] | null>(K_LINKS, null);
  links.value = Array.isArray(stored) && stored.length ? stored : DEFAULT_LINKS.slice();
}

function openLink(link: QuickLink) {
  if (editMode.value) return;
  const u = normalizeUrl(link.url);
  if (u) location.href = u;
}

function removeLink(idx: number) {
  const [removed] = links.value.splice(idx, 1);
  storeSet(K_LINKS, links.value);
  toast(t('subbar.removed', { name: removed.name }));
}

function openAddModal() {
  editingIndex.value = -1;
  formName.value = '';
  formUrl.value = '';
  modalOpen.value = true;
  setTimeout(() => urlInput.value?.focus());
}

function openEditModal(idx: number) {
  const link = links.value[idx];
  if (!link) return;
  editingIndex.value = idx;
  formName.value = link.name;
  formUrl.value = link.url;
  modalOpen.value = true;
  setTimeout(() => urlInput.value?.focus());
}

function closeModal() {
  modalOpen.value = false;
}

function saveModal() {
  const url = normalizeUrl(formUrl.value);
  if (!url) {
    toast(t('subbar.urlInvalid'));
    return;
  }
  let name = formName.value.trim();
  if (!name) {
    try {
      name = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      name = url;
    }
  }
  if (editingIndex.value >= 0) {
    links.value[editingIndex.value] = { name, url };
    toast(t('subbar.saved'));
  } else {
    links.value.push({ name, url });
    toast(t('subbar.added'));
  }
  storeSet(K_LINKS, links.value);
  closeModal();
}

/* 拖拽排序：把 from 移动到 to 的位置（参考 RSS chip 的实现） */
function moveLink(from: number, to: number) {
  if (from === to) return;
  const list = links.value.slice();
  const [moved] = list.splice(from, 1);
  const insertAt = from < to ? to - 1 : to;
  list.splice(insertAt, 0, moved);
  links.value = list;
  storeSet(K_LINKS, list);
}

function onPillDragStart(e: DragEvent, idx: number) {
  if (!editMode.value) return;
  dragIdx.value = idx;
  e.dataTransfer?.setData('text/plain', String(idx));
}

function onPillDragOver(e: DragEvent, idx: number) {
  if (!editMode.value || dragIdx.value === null || dragIdx.value === idx) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dropIdx.value = idx;
}

function onPillDrop(e: DragEvent, idx: number) {
  if (!editMode.value || dragIdx.value === null) return;
  e.preventDefault();
  moveLink(dragIdx.value, idx);
  dragIdx.value = null;
  dropIdx.value = null;
}

function onPillDragEnd() {
  dragIdx.value = null;
  dropIdx.value = null;
}

function onModalBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) closeModal();
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && modalOpen.value) closeModal();
}

onMounted(() => {
  loadLinks();
  document.addEventListener('keydown', onDocKeydown);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onDocKeydown));
</script>

<template>
  <div class="subbar" :class="{ 'is-wide': activeTab === 'github' }">
    <button
      class="icon-btn subbar-toggle"
      :title="subbarView === 'tabs' ? t('subbar.showLinks') : t('subbar.showTabs')"
      @click="toggleSubbar"
    >
      <svg v-if="subbarView === 'links'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M3 10h7V5" />
        <path d="M14 10h7" />
      </svg>
    </button>

    <Transition name="subswap" mode="out-in">
      <div v-if="subbarView === 'links'" key="links" class="sub-swap">
        <div class="links-pills" @dragover.self.prevent>
          <span
            v-for="(link, idx) in links"
            :key="link.url + idx"
            class="pill"
            :class="{ dragging: dragIdx === idx, 'drop-target': dropIdx === idx }"
            :draggable="editMode"
            @dragstart="onPillDragStart($event, idx)"
            @dragover="onPillDragOver($event, idx)"
            @drop="onPillDrop($event, idx)"
            @dragend="onPillDragEnd"
          >
            <button
              class="pill-inner"
              :title="editMode ? t('subbar.editHint') : link.url"
              @click="editMode ? openEditModal(idx) : openLink(link)"
            >
              <SiteIcon :url="link.url" :name="link.name" icon-class="pill-icon" />
              <span>{{ link.name }}</span>
            </button>
            <button v-if="editMode" class="pill-del" :title="t('subbar.delete')" @click.stop="removeLink(idx)">✕</button>
          </span>
          <span class="pill pill-add">
            <button class="pill-inner" @click="openAddModal">
              <span class="plus">+</span>
              <span>{{ t('subbar.add') }}</span>
            </button>
          </span>
        </div>
        <button class="text-btn links-edit" @click="editMode = !editMode">
          {{ editMode ? t('subbar.done') : t('subbar.manage') }}
        </button>
      </div>

      <nav v-else key="tabs" class="tabbar">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="tab-btn"
          :class="{ active: tab.id === activeTab }"
          @click="switchTab(tab.id)"
        >
          {{ t('tab.' + tab.id) }}
        </button>
      </nav>
    </Transition>
  </div>

  <!-- 添加/编辑快捷方式弹窗（挂到 body，避免被搜索区容器裁剪/错位） -->
  <Teleport to="body">
    <div class="modal-backdrop" :class="{ hidden: !modalOpen }" @click="onModalBackdropClick">
      <div class="modal">
        <h3>{{ editingIndex >= 0 ? t('subbar.editModal') : t('subbar.addModal') }}</h3>
        <label class="field"
          >{{ t('subbar.name') }}
          <input v-model="formName" type="text" :placeholder="t('subbar.namePlaceholder')" autocomplete="off" @keydown.enter="saveModal" />
        </label>
        <label class="field"
          >{{ t('subbar.url') }}
          <input ref="urlInput" v-model="formUrl" type="text" placeholder="https://…" autocomplete="off" @keydown.enter="saveModal" />
        </label>
        <div class="modal-actions">
          <button class="text-btn" @click="closeModal">{{ t('subbar.cancel') }}</button>
          <button class="dark-btn" @click="saveModal">{{ t('subbar.save') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
