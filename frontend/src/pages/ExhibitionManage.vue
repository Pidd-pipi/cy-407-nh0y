<template>
  <section class="manage-page">
    <div class="page-head">
      <div>
        <h1>展览管理</h1>
        <p>编辑只修改草稿，3D 展厅始终展示线上快照；发布后版本号加一，展品顺序、主题色和导览关系一起生效。</p>
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
          :has-changes="exhibitionStore.hasUnpublishedChanges(item.id)"
          @open="router.push(`/exhibitions/${$event}`)"
          @edit="selectExhibition"
        />
      </section>

      <section class="panel-surface editor-panel">
        <header>
          <div class="editor-title">
            <h2>{{ isCreating ? '创建展览' : '编辑草稿' }}</h2>
            <template v-if="selected">
              <n-tag size="small" :bordered="false">{{ selected.version > 0 ? `线上 v${selected.version}` : '未发布' }}</n-tag>
              <n-tag v-if="selected.version > 0 && exhibitionStore.hasUnpublishedChanges(selected.id)" size="small" type="warning" :bordered="false">
                有未发布修改
              </n-tag>
            </template>
          </div>
          <n-button v-if="selectedId" quaternary type="error" @click="deleteSelected">删除</n-button>
        </header>
        <n-form label-placement="top" :show-feedback="false" class="form-stack">
          <n-form-item label="标题">
            <n-input v-model:value="draft.title" placeholder="展览标题" />
          </n-form-item>
          <n-form-item label="简介">
            <n-input v-model:value="draft.intro" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" />
          </n-form-item>
          <div class="field-grid">
            <n-form-item label="策展人">
              <n-input v-model:value="draft.curator" />
            </n-form-item>
            <n-form-item label="展厅主题色">
              <n-color-picker v-model:value="draft.themeColor" :show-alpha="false" />
            </n-form-item>
          </div>
          <n-form-item label="背景音乐 URL">
            <n-input v-model:value="draft.backgroundMusicUrl" placeholder="可选" />
          </n-form-item>
          <ArtifactPicker v-model="draft.artifactIds" :artifacts="artifactStore.artifacts" />
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
            <template v-if="isCreating">
              <n-button type="primary" @click="saveExhibition">创建</n-button>
            </template>
            <template v-else>
              <n-button type="primary" @click="saveExhibition">保存草稿</n-button>
              <n-button secondary :disabled="!selected?.published" @click="confirmDiscard">放弃草稿</n-button>
              <n-button secondary type="primary" @click="confirmPublish">发布</n-button>
            </template>
          </div>
        </n-form>

        <section v-if="selected && selected.history.length > 0" class="version-history">
          <h3>版本历史（保留最近 {{ EXHIBITION_HISTORY_LIMIT }} 个）</h3>
          <ul>
            <li v-for="item in selected.history" :key="item.id">
              <n-tag size="small" :type="item.version === selected.version ? 'success' : 'default'" :bordered="false">
                v{{ item.version }}
              </n-tag>
              <span v-if="item.version === selected.version" class="version-current">当前线上</span>
              <time>{{ formatTime(item.publishedAt) }}</time>
              <span class="version-meta">{{ item.snapshot.artifactIds.length }} 件展品</span>
              <n-button
                v-if="item.version !== selected.version"
                size="tiny"
                quaternary
                @click="confirmRollback(item.version)"
              >
                回滚
              </n-button>
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
import type { Artifact, ExhibitionContent, ExhibitionDraft } from '@/types';
import { EXHIBITION_HISTORY_LIMIT } from '@/types';

const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const artifactStore = useArtifactStore();
const exhibitionStore = useExhibitionStore();

const selectedId = ref(exhibitionStore.exhibitions[0]?.id ?? '');
const isCreating = ref(false);
const draft = reactive<ExhibitionDraft>(emptyDraft());

const selected = computed(() => exhibitionStore.getById(selectedId.value));
const pickedArtifacts = computed<Artifact[]>(() =>
  draft.artifactIds.map((id) => artifactStore.getById(id)).filter((artifact): artifact is Artifact => Boolean(artifact))
);

watch(
  selected,
  (value) => {
    if (!value || isCreating.value) return;
    syncDraft(value.draft);
  },
  { immediate: true }
);

function emptyDraft(): ExhibitionDraft {
  return {
    title: '',
    intro: '',
    curator: '',
    artifactIds: artifactStore.artifacts.map((artifact) => artifact.id),
    themeColor: '#173f35',
    backgroundMusicUrl: '',
    tourIds: []
  };
}

function syncDraft(content: ExhibitionContent) {
  Object.assign(draft, {
    title: content.title,
    intro: content.intro,
    curator: content.curator,
    artifactIds: [...content.artifactIds],
    themeColor: content.themeColor,
    backgroundMusicUrl: content.backgroundMusicUrl ?? '',
    tourIds: [...content.tourIds]
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function startCreate() {
  isCreating.value = true;
  selectedId.value = '';
  Object.assign(draft, emptyDraft());
}

function selectExhibition(id: string) {
  isCreating.value = false;
  selectedId.value = id;
}

async function saveExhibition() {
  if (!draft.title.trim()) {
    message.warning('请填写展览标题');
    return;
  }
  if (isCreating.value) {
    const created = await exhibitionStore.createExhibition({ ...draft, artifactIds: [...draft.artifactIds] });
    selectedId.value = created.id;
    isCreating.value = false;
    message.success('展览已创建为草稿，点击发布即可完成首次发布');
    return;
  }
  if (selectedId.value) {
    await exhibitionStore.updateDraft(selectedId.value, { ...draft, artifactIds: [...draft.artifactIds] });
    message.success('草稿已保存，线上内容不受影响');
  }
}

function confirmDiscard() {
  const current = selected.value;
  if (!current?.published) return;
  dialog.warning({
    title: '放弃草稿',
    content: `放弃当前草稿，恢复为线上版本 v${current.version} 的内容？未发布的修改将丢失。`,
    positiveText: '放弃草稿',
    negativeText: '取消',
    onPositiveClick: async () => {
      await exhibitionStore.discardDraft(current.id);
      message.success(`草稿已恢复为线上版本 v${current.version}`);
    }
  });
}

async function confirmPublish() {
  if (!selectedId.value) return;
  if (!draft.title.trim()) {
    message.warning('请填写展览标题');
    return;
  }
  // 发布前把表单内容写入草稿，确保发布出去的线上快照与待发布草稿一致
  await exhibitionStore.updateDraft(selectedId.value, { ...draft, artifactIds: [...draft.artifactIds] });
  const current = exhibitionStore.getById(selectedId.value);
  if (!current) return;
  const nextVersion = current.version + 1;
  dialog.warning({
    title: '确认发布',
    content: current.published
      ? `当前线上版本 v${current.version} 将被覆盖：发布后线上内容升级为 v${nextVersion}，展品顺序、主题色和导览关系一并生效。`
      : `当前展览还没有线上版本，本次发布将生成首个线上版本 v${nextVersion}。`,
    positiveText: `发布 v${nextVersion}`,
    negativeText: '取消',
    onPositiveClick: async () => {
      await exhibitionStore.publishExhibition(current.id);
      message.success(`已发布 v${nextVersion}，线上内容已更新`);
    }
  });
}

function confirmRollback(version: number) {
  const current = selected.value;
  if (!current) return;
  dialog.warning({
    title: '回滚版本',
    content: `将历史版本 v${version} 的内容读回草稿？当前草稿会被覆盖，需重新发布后才会覆盖线上版本 v${current.version}。`,
    positiveText: '回滚到草稿',
    negativeText: '取消',
    onPositiveClick: async () => {
      await exhibitionStore.rollbackToVersion(current.id, version);
      message.success(`v${version} 已读回草稿，发布后生效`);
    }
  });
}

async function deleteSelected() {
  if (!selectedId.value) return;
  await exhibitionStore.deleteExhibition(selectedId.value);
  selectedId.value = exhibitionStore.exhibitions[0]?.id ?? '';
  isCreating.value = !selectedId.value;
  if (isCreating.value) {
    Object.assign(draft, emptyDraft());
  }
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

.form-actions {
  justify-content: flex-start;
}

.editor-title {
  display: flex;
  align-items: center;
  gap: 10px;
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

.version-history {
  display: grid;
  gap: 10px;
  border-top: 1px solid rgba(23, 63, 53, 0.14);
  padding-top: 14px;
}

.version-history h3 {
  margin: 0;
  font-size: 15px;
}

.version-history ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.version-history li {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(31, 46, 41, 0.72);
  font-size: 13px;
}

.version-history time {
  color: rgba(31, 46, 41, 0.56);
}

.version-current {
  color: var(--museum-green);
  font-weight: 700;
}

.version-meta {
  flex: 1;
}

@media (max-width: 1080px) {
  .manage-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
