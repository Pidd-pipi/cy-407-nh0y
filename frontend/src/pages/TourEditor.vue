<template>
  <section v-if="exhibition" class="tour-page">
    <div class="page-head">
      <div>
        <h1>导览编辑</h1>
        <p>导览修改只保存在草稿中，随展览发布后才会在 3D 展厅生效。</p>
      </div>
      <div v-if="tour" class="tour-actions">
        <n-input v-model:value="tourName" placeholder="导览名称" />
        <n-button type="primary" @click="saveTourName">保存名称</n-button>
        <n-button secondary @click="addNode">添加节点</n-button>
      </div>
    </div>

    <template v-if="tour">
      <div class="tour-grid">
        <section class="panel-surface timeline-panel">
          <div class="tour-meta">
            <strong>{{ exhibition.draft.title || '未命名展览' }}</strong>
            <span>{{ tour.nodes.length }} 个导览节点</span>
          </div>
          <div class="tour-status">
            <n-tag v-if="exhibition.live" :bordered="false" type="success" size="small">
              线上 v{{ exhibition.live.version }}
            </n-tag>
            <n-tag v-else :bordered="false" size="small">未发布</n-tag>
            <span>当前编辑的是草稿，发布后参观者才能看到</span>
          </div>
          <TourTimeline
            :nodes="tour.nodes"
            :artifacts="artifactStore.artifacts"
            :selected-node-id="selectedNodeId"
            @select="selectedNodeId = $event"
            @reorder="reorderNodes"
            @remove="removeNode"
          />
        </section>

        <CameraSetter :node="selectedNode" :artifacts="artifactStore.artifacts" @update="updateNode" />
      </div>
    </template>
    <section v-else class="panel-surface empty-tour">
      <n-empty description="该展览还没有导览路线">
        <template #extra>
          <n-button type="primary" @click="createTour">创建导览</n-button>
        </template>
      </n-empty>
    </section>
  </section>
  <n-result v-else status="404" title="展览不存在" description="请先在展览管理中创建展览。" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import CameraSetter from '@/components/editor/CameraSetter.vue';
import TourTimeline from '@/components/editor/TourTimeline.vue';
import { useArtifactStore } from '@/stores/artifact';
import { useExhibitionStore } from '@/stores/exhibition';
import type { ExhibitionTour, TourNode } from '@/types';
import { createId } from '@/utils/storage';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const artifactStore = useArtifactStore();
const exhibitionStore = useExhibitionStore();

const selectedNodeId = ref('');
const tourName = ref('');

const exhibition = computed(() => {
  const id = String(route.params.id ?? '');
  return exhibitionStore.getById(id) ?? exhibitionStore.exhibitions[0];
});

/** 编辑对象是展览草稿里的导览，线上快照不受影响 */
const tour = computed(() => exhibition.value?.draft.tour ?? null);
const selectedNode = computed(() => tour.value?.nodes.find((node) => node.id === selectedNodeId.value));

watch(
  () => exhibition.value?.id,
  (id, previousId) => {
    if (!id) return;
    if (route.params.id !== id) {
      void router.replace(`/manage/tours/${id}`);
    }
    if (id !== previousId) {
      tourName.value = tour.value?.name ?? '';
      selectedNodeId.value = tour.value?.nodes[0]?.id ?? '';
    }
  },
  { immediate: true }
);

async function commitTour(next: ExhibitionTour) {
  if (!exhibition.value) return;
  await exhibitionStore.updateDraft(exhibition.value.id, { tour: next });
}

async function createTour() {
  const name = '新导览路线';
  await commitTour({ name, nodes: [] });
  tourName.value = name;
  message.success('导览已创建，保存在草稿中');
}

async function saveTourName() {
  if (!tour.value || !tourName.value.trim()) return;
  await commitTour({ ...tour.value, name: tourName.value.trim() });
  message.success('导览名称已保存到草稿');
}

async function addNode() {
  if (!tour.value || !artifactStore.artifacts[0]) return;
  const node: TourNode = {
    id: createId('tour-node'),
    artifactId: artifactStore.artifacts[0].id,
    cameraPosition: { x: 3.4, y: 2.2, z: 5 },
    targetPosition: { x: 0, y: 0, z: 0 },
    transitionMs: 2200,
    narration: '补充这一站的工艺讲解。'
  };
  await commitTour({ ...tour.value, nodes: [...tour.value.nodes, node] });
  selectedNodeId.value = node.id;
  message.success('节点已添加到草稿');
}

async function updateNode(patch: Omit<TourNode, 'id'>) {
  if (!tour.value || !selectedNodeId.value) return;
  await commitTour({
    ...tour.value,
    nodes: tour.value.nodes.map((node) => (node.id === selectedNodeId.value ? { ...node, ...patch } : node))
  });
  message.success('节点已保存到草稿');
}

async function reorderNodes(nodes: TourNode[]) {
  if (!tour.value) return;
  await commitTour({ ...tour.value, nodes });
}

async function removeNode(nodeId: string) {
  if (!tour.value) return;
  await commitTour({ ...tour.value, nodes: tour.value.nodes.filter((node) => node.id !== nodeId) });
  if (selectedNodeId.value === nodeId) {
    selectedNodeId.value = tour.value.nodes.find((node) => node.id !== nodeId)?.id ?? '';
  }
  message.success('节点已删除');
}
</script>

<style scoped>
.tour-page {
  display: grid;
  gap: 18px;
}

.tour-actions {
  display: grid;
  grid-template-columns: minmax(180px, 280px) auto auto;
  gap: 10px;
}

.tour-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.46fr);
  gap: 18px;
  align-items: start;
}

.timeline-panel {
  display: grid;
  gap: 16px;
  padding: 20px;
}

.tour-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.tour-meta strong {
  font-family: var(--font-display);
  font-size: 26px;
}

.tour-meta span {
  color: rgba(31, 46, 41, 0.62);
}

.tour-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(31, 46, 41, 0.62);
  font-size: 13px;
}

.empty-tour {
  padding: 40px 20px;
}

@media (max-width: 980px) {
  .tour-grid,
  .tour-actions {
    grid-template-columns: 1fr;
  }
}
</style>
