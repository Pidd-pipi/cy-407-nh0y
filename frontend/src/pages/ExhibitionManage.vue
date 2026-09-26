<template>
  <section class="manage-page">
    <div class="page-head">
      <div>
        <h1>展览管理</h1>
        <p>编辑只修改草稿，发布后展品顺序、主题色和导览一起同步到 3D 展厅。</p>
      </div>
      <n-button type="primary" @click="startCreate">新建展览</n-button>
    </div>

    <div class="manage-grid">
      <section class="exhibition-list">
        <ExhibitionCard
          v-for="item in exhibitionStore.exhibitions"
          :key="item.id"
          :exhibition="item"
          :artifact-count="item.draft.artifactIds.length"
          @open="router.push(`/exhibitions/${$event}`)"
          @edit="selectExhibition"
        />
      </section>

      <section class="panel-surface editor-panel">
        <header>
          <h2>{{ isCreating ? '创建展览' : '编辑草稿' }}</h2>
          <n-button v-if="selectedId" quaternary type="error" @click="deleteSelected">删除</n-button>
        </header>

        <div v-if="selected && !isCreating" class="status-row">
          <n-tag v-if="selected.live" :bordered="false" type="success">线上 v{{ selected.live.version }}</n-tag>
          <n-tag v-else :bordered="false">未发布</n-tag>
          <n-tag v-if="selected.live && isDirty" :bordered="false" type="warning">草稿有未发布修改</n-tag>
        </div>

        <n-form label-placement="top" :show-feedback="false" class="form-stack">
          <n-form-item label="标题">
            <n-input v-model:value="form.title" placeholder="展览标题" />
          </n-form-item>
          <n-form-item label="简介">
            <n-input v-model:value="form.intro" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" />
          </n-form-item>
          <div class="field-grid">
            <n-form-item label="策展人">
              <n-input v-model:value="form.curator" />
            </n-form-item>
            <n-form-item label="背景音乐 URL">
              <n-input v-model:value="form.backgroundMusicUrl" placeholder="可选" />
            </n-form-item>
          </div>
          <n-form-item label="展厅主题色">
            <n-color-picker v-model:value="form.themeColor" :show-alpha="false" />
          </n-form-item>
          <ArtifactPicker v-model="form.artifactIds" :artifacts="artifactStore.artifacts" />
          <section class="picked-artifacts">
            <h3>已选展品预览</h3>
            <ArtifactCard
              v-for="artifact in pickedArtifacts"
              :key="artifact.id"
              :artifact="artifact"
              compact
              @open="router.push(`/artifacts/${$event}`)"
            />
          </section>
          <div class="form-actions">
            <n-button type="primary" @click="saveExhibition">{{ isCreating ? '创建' : '保存草稿' }}</n-button>
            <n-button v-if="selected?.live && !isCreating" secondary @click="discardSelected">放弃草稿</n-button>
            <n-button v-if="!isCreating && selectedId" secondary type="primary" @click="publishSelected">发布</n-button>
          </div>
        </n-form>

        <section v-if="selected?.live && !isCreating" class="version-panel">
          <h3>版本历史</h3>
          <p class="version-hint">线上快照与最近五个历史版本保存在本地，重启后可读回并回滚。</p>
          <ul class="version-list">
            <li class="version-item current">
              <span class="version-color" :style="{ background: selected.live.themeColor }"></span>
              <div class="version-main">
                <strong>v{{ selected.live.version }}（当前线上）</strong>
                <span>
                  {{ formatTime(selected.live.publishedAt) }} · {{ selected.live.artifactIds.length }} 件展品 · 导览
                  {{ selected.live.tour?.nodes.length ?? 0 }} 站
                </span>
              </div>
            </li>
            <li v-for="item in selected.history" :key="item.version" class="version-item">
              <span class="version-color" :style="{ background: item.themeColor }"></span>
              <div class="version-main">
                <strong>v{{ item.version }}</strong>
                <span>
                  {{ formatTime(item.publishedAt) }} · {{ item.artifactIds.length }} 件展品 · 导览
                  {{ item.tour?.nodes.length ?? 0 }} 站
                </span>
              </div>
              <n-button size="tiny" quaternary @click="rollbackTo(item)">回滚</n-button>
            </li>
          </ul>
        </section>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDialog, useMessage } from 'naive-ui';
import ArtifactPicker from '@/components/editor/ArtifactPicker.vue';
import ArtifactCard from '@/components/common/ArtifactCard.vue';
import ExhibitionCard from '@/components/common/ExhibitionCard.vue';
import { useArtifactStore } from '@/stores/artifact';
import { useExhibitionStore } from '@/stores/exhibition';
import type { Artifact, ExhibitionContent, ExhibitionVersion } from '@/types';
import { isDraftDirty } from '@/utils/exhibition';

const router = useRouter();
const dialog = useDialog();
const message = useMessage();
const artifactStore = useArtifactStore();
const exhibitionStore = useExhibitionStore();

interface ExhibitionForm {
  title: string;
  intro: string;
  curator: string;
  artifactIds: string[];
  themeColor: string;
  backgroundMusicUrl: string;
}

const selectedId = ref(exhibitionStore.exhibitions[0]?.id ?? '');
const isCreating = ref(false);
const form = reactive<ExhibitionForm>(emptyForm());

const selected = computed(() => exhibitionStore.getById(selectedId.value));
const isDirty = computed(() => (selected.value ? isDraftDirty(selected.value) : false));
const pickedArtifacts = computed<Artifact[]>(() =>
  form.artifactIds.map((id) => artifactStore.getById(id)).filter((artifact): artifact is Artifact => Boolean(artifact))
);

watch(
  selected,
  (value) => {
    if (!value || isCreating.value) return;
    Object.assign(form, formFromContent(value.draft));
  },
  { immediate: true }
);

function emptyForm(): ExhibitionForm {
  return {
    title: '',
    intro: '',
    curator: '',
    artifactIds: artifactStore.artifacts.map((artifact) => artifact.id),
    themeColor: '#173f35',
    backgroundMusicUrl: ''
  };
}

function formFromContent(content: ExhibitionContent): ExhibitionForm {
  return {
    title: content.title,
    intro: content.intro,
    curator: content.curator,
    artifactIds: [...content.artifactIds],
    themeColor: content.themeColor,
    backgroundMusicUrl: content.backgroundMusicUrl ?? ''
  };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function startCreate() {
  isCreating.value = true;
  selectedId.value = '';
  Object.assign(form, emptyForm());
}

function selectExhibition(id: string) {
  isCreating.value = false;
  selectedId.value = id;
}

async function saveExhibition() {
  if (!form.title.trim()) {
    message.warning('请填写展览标题');
    return;
  }
  if (isCreating.value) {
    const created = await exhibitionStore.createExhibition({
      ...form,
      artifactIds: [...form.artifactIds],
      tour: null
    });
    selectedId.value = created.id;
    isCreating.value = false;
    message.success('展览已创建为草稿，点击发布完成首次上线');
    return;
  }
  if (selectedId.value) {
    await exhibitionStore.updateDraft(selectedId.value, { ...form, artifactIds: [...form.artifactIds] });
    message.success('草稿已保存，发布后才会在 3D 展厅生效');
  }
}

function discardSelected() {
  const live = selected.value?.live;
  if (!live || !selectedId.value) return;
  dialog.warning({
    title: '放弃草稿',
    content: `将放弃当前草稿的全部修改，恢复为线上版本 v${live.version} 的内容，3D 展厅展示的线上版本不受影响。`,
    positiveText: '放弃修改',
    negativeText: '取消',
    onPositiveClick: async () => {
      await exhibitionStore.discardDraft(selectedId.value);
      const draft = exhibitionStore.getById(selectedId.value)?.draft;
      if (draft) Object.assign(form, formFromContent(draft));
      message.success(`草稿已恢复为线上版本 v${live.version}`);
    }
  });
}

async function publishSelected() {
  if (!selectedId.value || !selected.value) return;
  if (!form.title.trim()) {
    message.warning('请填写展览标题');
    return;
  }
  const live = selected.value.live;
  const nextVersion = (live?.version ?? 0) + 1;
  // 先把表单落进草稿，保证发布的内容与编辑界面一致
  await exhibitionStore.updateDraft(selectedId.value, { ...form, artifactIds: [...form.artifactIds] });
  dialog.warning({
    title: '发布展览',
    content: live
      ? `当前线上版本 v${live.version} 将被覆盖并移入历史版本，发布后线上版本号为 v${nextVersion}。展品顺序、主题色和导览将随本次发布一起生效。`
      : `本次为首次发布，没有线上版本会被覆盖，发布后线上版本号为 v${nextVersion}。展品顺序、主题色和导览将随本次发布一起生效。`,
    positiveText: '确认发布',
    negativeText: '取消',
    onPositiveClick: async () => {
      await exhibitionStore.publishExhibition(selectedId.value);
      message.success(`已发布，当前线上版本为 v${nextVersion}`);
    }
  });
}

function rollbackTo(version: ExhibitionVersion) {
  const current = selected.value;
  if (!current?.live) return;
  dialog.warning({
    title: `回滚到 v${version.version}`,
    content: `当前线上版本 v${current.live.version} 将被覆盖并移入历史版本，回滚后线上版本号为 v${current.live.version + 1}，草稿将同步为回滚后的内容。`,
    positiveText: '确认回滚',
    negativeText: '取消',
    onPositiveClick: async () => {
      const live = await exhibitionStore.rollbackExhibition(current.id, version.version);
      if (live) message.success(`已回滚，当前线上版本为 v${live.version}`);
    }
  });
}

async function deleteSelected() {
  if (!selectedId.value) return;
  await exhibitionStore.deleteExhibition(selectedId.value);
  selectedId.value = exhibitionStore.exhibitions[0]?.id ?? '';
  isCreating.value = !selectedId.value;
  Object.assign(form, selected.value ? formFromContent(selected.value.draft) : emptyForm());
  message.success('展览已删除');
}
</script>

<style scoped>
.manage-page {
  display: grid;
  gap: 18px;
}

.manage-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(420px, 1.1fr);
  gap: 18px;
  align-items: start;
}

.exhibition-list {
  display: grid;
  gap: 14px;
}

.editor-panel {
  display: grid;
  gap: 16px;
  padding: 20px;
}

.editor-panel header,
.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.picked-artifacts {
  display: grid;
  gap: 10px;
}

.picked-artifacts h3 {
  margin: 0;
  font-size: 15px;
}

.editor-panel h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 30px;
}

.form-stack {
  display: grid;
  gap: 10px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.version-panel {
  display: grid;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px dashed rgba(23, 63, 53, 0.2);
}

.version-panel h3 {
  margin: 0;
  font-size: 15px;
}

.version-hint {
  margin: 0;
  color: rgba(31, 46, 41, 0.6);
  font-size: 13px;
}

.version-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.version-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #fbf5e8;
  border: 1px solid rgba(23, 63, 53, 0.14);
  border-radius: 8px;
}

.version-item.current {
  border-color: var(--museum-brass);
}

.version-color {
  flex: 0 0 auto;
  width: 14px;
  height: 34px;
  border-radius: 4px;
}

.version-main {
  display: grid;
  flex: 1 1 auto;
  gap: 2px;
  min-width: 0;
}

.version-main span {
  color: rgba(31, 46, 41, 0.62);
  font-size: 12px;
}

@media (max-width: 1080px) {
  .manage-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
