import { defineStore } from 'pinia';
import { exhibitionRepository, legacyTourRepository } from '@/api/storage';
import {
  ExhibitionStatus,
  type Exhibition,
  type ExhibitionContent,
  type ExhibitionTour,
  type ExhibitionVersion,
  type Tour,
  type TourNode
} from '@/types';
import { cloneContent, MAX_HISTORY_VERSIONS } from '@/utils/exhibition';
import { createId } from '@/utils/storage';
import { useArtifactStore } from './artifact';

function createSeedTour(artifactIds: string[]): ExhibitionTour {
  const nodes: TourNode[] = artifactIds.slice(0, 3).map((artifactId, index) => ({
    id: createId('tour-node'),
    artifactId,
    cameraPosition: { x: 4 - index * 1.5, y: 2.4, z: 5 - index },
    targetPosition: { x: 0, y: 0.2, z: 0 },
    transitionMs: 2600,
    narration: ['从器型观察手工成型痕迹。', '靠近纹样，比较线材与针法。', '改变角度查看材料反光。'][index] ?? ''
  }));

  return { name: '材料与手势导览', nodes };
}

function createSeedExhibition(artifactIds: string[]): Exhibition {
  const now = new Date().toISOString();
  const content: ExhibitionContent = {
    title: '手作纹理常设展',
    intro: '围绕陶、绣、漆、竹四类工艺组织展陈，强调材料、手势和纹样的对照关系。',
    curator: '云上工艺馆',
    artifactIds,
    themeColor: '#173f35',
    backgroundMusicUrl: '',
    tour: createSeedTour(artifactIds)
  };

  return {
    id: 'exhibition-heritage-hall',
    draft: cloneContent(content),
    live: { ...cloneContent(content), version: 1, publishedAt: now },
    history: [],
    createdAt: now,
    updatedAt: now
  };
}

/** 旧版扁平展览记录（草稿与线上内容未分离） */
interface LegacyExhibitionRecord {
  id: string;
  title: string;
  intro: string;
  curator: string;
  artifactIds: string[];
  themeColor: string;
  backgroundMusicUrl?: string;
  status: ExhibitionStatus;
  createdAt: string;
  updatedAt: string;
}

function isLegacyRecord(record: Exhibition | LegacyExhibitionRecord): record is LegacyExhibitionRecord {
  return !('draft' in record);
}

async function migrateLegacyRecord(record: LegacyExhibitionRecord, legacyTours: Tour[]): Promise<Exhibition> {
  const legacyTour = legacyTours.find((tour) => tour.exhibitionId === record.id);
  const content: ExhibitionContent = {
    title: record.title,
    intro: record.intro,
    curator: record.curator,
    artifactIds: [...record.artifactIds],
    themeColor: record.themeColor,
    backgroundMusicUrl: record.backgroundMusicUrl,
    tour: legacyTour ? { name: legacyTour.name, nodes: legacyTour.nodes } : null
  };
  const migrated: Exhibition = {
    id: record.id,
    draft: cloneContent(content),
    live:
      record.status === ExhibitionStatus.Published
        ? { ...cloneContent(content), version: 1, publishedAt: record.updatedAt }
        : null,
    history: [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  await exhibitionRepository.save(migrated);
  return migrated;
}

export const useExhibitionStore = defineStore('exhibition', {
  state: () => ({
    exhibitions: [] as Exhibition[],
    loaded: false
  }),
  getters: {
    getById: (state) => (id: string) => state.exhibitions.find((exhibition) => exhibition.id === id),
    published: (state) => state.exhibitions.filter((exhibition) => exhibition.live)
  },
  actions: {
    async load() {
      const records = await exhibitionRepository.list();
      if (records.length === 0) {
        const artifactStore = useArtifactStore();
        const seed = createSeedExhibition(artifactStore.artifacts.map((artifact) => artifact.id));
        await exhibitionRepository.save(seed);
        this.exhibitions = [seed];
      } else {
        const legacyTours = records.some(isLegacyRecord) ? await legacyTourRepository.list() : [];
        this.exhibitions = await Promise.all(
          records.map((record) => (isLegacyRecord(record) ? migrateLegacyRecord(record, legacyTours) : record))
        );
      }
      this.loaded = true;
    },
    async createExhibition(content: ExhibitionContent) {
      const now = new Date().toISOString();
      const exhibition: Exhibition = {
        id: createId('exhibition'),
        draft: cloneContent(content),
        live: null,
        history: [],
        createdAt: now,
        updatedAt: now
      };
      this.exhibitions.unshift(exhibition);
      await exhibitionRepository.save(exhibition);
      return exhibition;
    },
    /** 编辑只写草稿，线上快照不受影响 */
    async updateDraft(id: string, patch: Partial<ExhibitionContent>) {
      const current = this.getById(id);
      if (!current) return;
      const updated: Exhibition = {
        ...current,
        draft: { ...current.draft, ...patch },
        updatedAt: new Date().toISOString()
      };
      this.exhibitions = this.exhibitions.map((exhibition) => (exhibition.id === id ? updated : exhibition));
      await exhibitionRepository.save(updated);
    },
    /** 放弃草稿，恢复为线上版本的内容 */
    async discardDraft(id: string) {
      const current = this.getById(id);
      if (!current?.live) return;
      await this.updateDraft(id, cloneContent(current.live));
    },
    /** 发布：草稿成为新的线上快照，版本号加一，旧版本移入历史 */
    async publishExhibition(id: string) {
      const current = this.getById(id);
      if (!current) return;
      const now = new Date().toISOString();
      const live: ExhibitionVersion = {
        ...cloneContent(current.draft),
        version: (current.live?.version ?? 0) + 1,
        publishedAt: now
      };
      const history = current.live
        ? [current.live, ...current.history].slice(0, MAX_HISTORY_VERSIONS)
        : current.history;
      const updated: Exhibition = { ...current, live, history, updatedAt: now };
      this.exhibitions = this.exhibitions.map((exhibition) => (exhibition.id === id ? updated : exhibition));
      await exhibitionRepository.save(updated);
      return live;
    },
    /** 回滚：把历史版本的内容作为新版本发布，草稿同步为线上内容 */
    async rollbackExhibition(id: string, version: number) {
      const current = this.getById(id);
      if (!current?.live) return;
      const target = current.history.find((item) => item.version === version);
      if (!target) return;
      const now = new Date().toISOString();
      const live: ExhibitionVersion = {
        ...cloneContent(target),
        version: current.live.version + 1,
        publishedAt: now
      };
      const history = [current.live, ...current.history.filter((item) => item.version !== version)].slice(
        0,
        MAX_HISTORY_VERSIONS
      );
      const updated: Exhibition = {
        ...current,
        draft: cloneContent(live),
        live,
        history,
        updatedAt: now
      };
      this.exhibitions = this.exhibitions.map((exhibition) => (exhibition.id === id ? updated : exhibition));
      await exhibitionRepository.save(updated);
      return live;
    },
    async deleteExhibition(id: string) {
      this.exhibitions = this.exhibitions.filter((exhibition) => exhibition.id !== id);
      await exhibitionRepository.remove(id);
    },
    async reorderArtifacts(id: string, artifactIds: string[]) {
      await this.updateDraft(id, { artifactIds });
    }
  }
});
