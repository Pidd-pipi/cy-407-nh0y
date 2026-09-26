import { defineStore } from 'pinia';
import { exhibitionRepository } from '@/api/storage';
import {
  ExhibitionStatus,
  EXHIBITION_HISTORY_LIMIT,
  type Exhibition,
  type ExhibitionContent,
  type ExhibitionDraft,
  type ExhibitionVersion
} from '@/types';
import { createId } from '@/utils/storage';
import { useArtifactStore } from './artifact';
import { useTourStore } from './tour';

/** 旧版展览记录：内容字段平铺在顶层，没有草稿/线上快照之分 */
interface LegacyExhibitionRecord {
  id: string;
  status: ExhibitionStatus;
  title?: string;
  intro?: string;
  curator?: string;
  artifactIds?: string[];
  themeColor?: string;
  backgroundMusicUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

function cloneContent(content: ExhibitionContent): ExhibitionContent {
  return {
    title: content.title,
    intro: content.intro,
    curator: content.curator,
    artifactIds: [...content.artifactIds],
    themeColor: content.themeColor,
    backgroundMusicUrl: content.backgroundMusicUrl ?? '',
    tourIds: [...content.tourIds]
  };
}

function emptyContent(): ExhibitionContent {
  return {
    title: '',
    intro: '',
    curator: '',
    artifactIds: [],
    themeColor: '#173f35',
    backgroundMusicUrl: '',
    tourIds: []
  };
}

function sameContent(a: ExhibitionContent, b: ExhibitionContent): boolean {
  return JSON.stringify(cloneContent(a)) === JSON.stringify(cloneContent(b));
}

function isVersioned(record: Exhibition | LegacyExhibitionRecord): record is Exhibition {
  return Boolean((record as Exhibition).draft);
}

function normalizeExhibition(record: Exhibition | LegacyExhibitionRecord): { exhibition: Exhibition; migrated: boolean } {
  if (isVersioned(record)) {
    return { exhibition: record, migrated: false };
  }

  const now = new Date().toISOString();
  const content: ExhibitionContent = {
    title: record.title ?? '',
    intro: record.intro ?? '',
    curator: record.curator ?? '',
    artifactIds: record.artifactIds ?? [],
    themeColor: record.themeColor ?? '#173f35',
    backgroundMusicUrl: record.backgroundMusicUrl ?? '',
    tourIds: []
  };
  const published = record.status === ExhibitionStatus.Published ? cloneContent(content) : null;
  const version = published ? 1 : 0;
  return {
    migrated: true,
    exhibition: {
      id: record.id,
      status: record.status ?? ExhibitionStatus.Draft,
      version,
      draft: cloneContent(content),
      published,
      history: published
        ? [{ id: createId('version'), version, snapshot: cloneContent(content), publishedAt: record.updatedAt ?? now }]
        : [],
      createdAt: record.createdAt ?? now,
      updatedAt: record.updatedAt ?? now
    }
  };
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
    tourIds: ['tour-default-route']
  };
  return {
    id: 'exhibition-heritage-hall',
    status: ExhibitionStatus.Published,
    version: 1,
    draft: cloneContent(content),
    published: cloneContent(content),
    history: [{ id: createId('version'), version: 1, snapshot: cloneContent(content), publishedAt: now }],
    createdAt: now,
    updatedAt: now
  };
}

export const useExhibitionStore = defineStore('exhibition', {
  state: () => ({
    exhibitions: [] as Exhibition[],
    loaded: false
  }),
  getters: {
    getById: (state) => (id: string) => state.exhibitions.find((exhibition) => exhibition.id === id),
    published: (state) => state.exhibitions.filter((exhibition) => exhibition.status === ExhibitionStatus.Published),
    /** 草稿与线上快照不一致（或从未发布）时视为有未发布修改 */
    hasUnpublishedChanges: (state) => (id: string) => {
      const exhibition = state.exhibitions.find((item) => item.id === id);
      if (!exhibition) return false;
      if (!exhibition.published) return true;
      return !sameContent(exhibition.draft, exhibition.published);
    }
  },
  actions: {
    async load() {
      const records = (await exhibitionRepository.list()) as unknown as Array<Exhibition | LegacyExhibitionRecord>;
      if (records.length === 0) {
        const artifactStore = useArtifactStore();
        const seed = createSeedExhibition(artifactStore.artifacts.map((artifact) => artifact.id));
        await exhibitionRepository.save(seed);
        this.exhibitions = [seed];
      } else {
        const normalized = records.map((record) => normalizeExhibition(record));
        this.exhibitions = normalized.map((item) => item.exhibition);
        const migrated = normalized.filter((item) => item.migrated).map((item) => item.exhibition);
        if (migrated.length > 0) {
          await exhibitionRepository.saveMany(migrated);
        }
      }
      this.loaded = true;
    },
    async createExhibition(draft: ExhibitionDraft) {
      const now = new Date().toISOString();
      const exhibition: Exhibition = {
        id: createId('exhibition'),
        status: ExhibitionStatus.Draft,
        version: 0,
        draft: cloneContent({ ...emptyContent(), ...draft }),
        published: null,
        history: [],
        createdAt: now,
        updatedAt: now
      };
      this.exhibitions.unshift(exhibition);
      await exhibitionRepository.save(exhibition);
      return exhibition;
    },
    /** 编辑只写草稿，线上快照保持不变 */
    async updateDraft(id: string, patch: Partial<ExhibitionDraft>) {
      const current = this.getById(id);
      if (!current) return;
      await this.persist({
        ...current,
        draft: cloneContent({ ...current.draft, ...patch }),
        updatedAt: new Date().toISOString()
      });
    },
    /** 放弃草稿，恢复为线上版本的内容 */
    async discardDraft(id: string) {
      const current = this.getById(id);
      if (!current || !current.published) return;
      await this.persist({
        ...current,
        draft: cloneContent(current.published),
        updatedAt: new Date().toISOString()
      });
    },
    /** 发布：草稿整体成为线上快照，版本号 +1，并写入历史（保留最近 5 个） */
    async publishExhibition(id: string) {
      const current = this.getById(id);
      if (!current) return;
      const tourStore = useTourStore();
      const now = new Date().toISOString();
      const nextVersion = current.version + 1;
      const snapshot = cloneContent({
        ...current.draft,
        tourIds: tourStore.byExhibitionId(id).map((tour) => tour.id)
      });
      const record: ExhibitionVersion = {
        id: createId('version'),
        version: nextVersion,
        snapshot: cloneContent(snapshot),
        publishedAt: now
      };
      await this.persist({
        ...current,
        status: ExhibitionStatus.Published,
        version: nextVersion,
        draft: cloneContent(snapshot),
        published: cloneContent(snapshot),
        history: [record, ...current.history].slice(0, EXHIBITION_HISTORY_LIMIT),
        updatedAt: now
      });
      return nextVersion;
    },
    /** 把历史版本读回草稿，需再次发布才会覆盖线上内容 */
    async rollbackToVersion(id: string, version: number) {
      const current = this.getById(id);
      if (!current) return;
      const target = current.history.find((item) => item.version === version);
      if (!target) return;
      await this.persist({
        ...current,
        draft: cloneContent(target.snapshot),
        updatedAt: new Date().toISOString()
      });
    },
    async deleteExhibition(id: string) {
      this.exhibitions = this.exhibitions.filter((exhibition) => exhibition.id !== id);
      await exhibitionRepository.remove(id);
    },
    async reorderArtifacts(id: string, artifactIds: string[]) {
      await this.updateDraft(id, { artifactIds });
    },
    async persist(exhibition: Exhibition) {
      this.exhibitions = this.exhibitions.map((item) => (item.id === exhibition.id ? exhibition : item));
      await exhibitionRepository.save(exhibition);
    }
  }
});
