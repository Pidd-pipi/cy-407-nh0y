import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { EXHIBITION_HISTORY_LIMIT, ExhibitionStatus } from '@/types';

const DB_NAME = 'craft-gallery-local';

async function resetDatabase() {
  const { getDatabase } = await import('@/utils/storage');
  const db = await getDatabase();
  db.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('delete blocked'));
  });
  vi.resetModules();
}

async function loadStores() {
  setActivePinia(createPinia());
  const { useArtifactStore } = await import('@/stores/artifact');
  const { useExhibitionStore } = await import('@/stores/exhibition');
  const { useTourStore } = await import('@/stores/tour');
  const artifactStore = useArtifactStore();
  const exhibitionStore = useExhibitionStore();
  const tourStore = useTourStore();
  await artifactStore.load();
  await exhibitionStore.load();
  await tourStore.load();
  return { artifactStore, exhibitionStore, tourStore };
}

describe('展览版本化发布', () => {
  beforeEach(resetDatabase);

  it('编辑只改草稿，线上快照保持不变；发布后版本号加一并整体生效', async () => {
    const { exhibitionStore } = await loadStores();
    const seed = exhibitionStore.exhibitions[0];
    expect(seed.version).toBe(1);
    expect(seed.published?.title).toBe('手作纹理常设展');

    await exhibitionStore.updateDraft(seed.id, { title: '未复核的新标题', themeColor: '#ff0000' });
    let current = exhibitionStore.getById(seed.id)!;
    expect(current.draft.title).toBe('未复核的新标题');
    expect(current.published?.title).toBe('手作纹理常设展');
    expect(current.published?.themeColor).not.toBe('#ff0000');
    expect(exhibitionStore.hasUnpublishedChanges(seed.id)).toBe(true);

    await exhibitionStore.publishExhibition(seed.id);
    current = exhibitionStore.getById(seed.id)!;
    expect(current.version).toBe(2);
    expect(current.published?.title).toBe('未复核的新标题');
    expect(current.published?.themeColor).toBe('#ff0000');
    expect(current.published?.tourIds).toEqual(['tour-default-route']);
    expect(current.history[0].version).toBe(2);
    expect(current.history[1].version).toBe(1);
    expect(exhibitionStore.hasUnpublishedChanges(seed.id)).toBe(false);
  });

  it('放弃草稿可恢复线上版本', async () => {
    const { exhibitionStore } = await loadStores();
    const seed = exhibitionStore.exhibitions[0];
    await exhibitionStore.updateDraft(seed.id, { title: '准备放弃的标题' });
    await exhibitionStore.discardDraft(seed.id);
    const current = exhibitionStore.getById(seed.id)!;
    expect(current.draft.title).toBe(current.published?.title);
    expect(exhibitionStore.hasUnpublishedChanges(seed.id)).toBe(false);
  });

  it('新建展览可直接完成首次发布', async () => {
    const { exhibitionStore } = await loadStores();
    const created = await exhibitionStore.createExhibition({
      title: '新展',
      intro: '',
      curator: '',
      artifactIds: [],
      themeColor: '#123456',
      backgroundMusicUrl: '',
      tourIds: []
    });
    expect(created.version).toBe(0);
    expect(created.published).toBeNull();

    await exhibitionStore.publishExhibition(created.id);
    const current = exhibitionStore.getById(created.id)!;
    expect(current.status).toBe(ExhibitionStatus.Published);
    expect(current.version).toBe(1);
    expect(current.published?.title).toBe('新展');
    expect(current.history).toHaveLength(1);
  });

  it('历史版本最多保留 5 个，且可回滚到草稿', async () => {
    const { exhibitionStore } = await loadStores();
    const seed = exhibitionStore.exhibitions[0];
    for (let i = 0; i < 7; i += 1) {
      await exhibitionStore.updateDraft(seed.id, { title: `第 ${i + 2} 版` });
      await exhibitionStore.publishExhibition(seed.id);
    }
    const current = exhibitionStore.getById(seed.id)!;
    expect(current.version).toBe(8);
    expect(current.history).toHaveLength(EXHIBITION_HISTORY_LIMIT);
    expect(current.history.map((item) => item.version)).toEqual([8, 7, 6, 5, 4]);

    await exhibitionStore.rollbackToVersion(seed.id, 5);
    const rolledBack = exhibitionStore.getById(seed.id)!;
    expect(rolledBack.version).toBe(8);
    expect(rolledBack.published?.title).toBe('第 8 版');
    expect(rolledBack.draft.title).toBe('第 5 版');
  });

  it('模拟重启后草稿、线上版本和历史版本都能读回', async () => {
    const { exhibitionStore } = await loadStores();
    const seed = exhibitionStore.exhibitions[0];
    await exhibitionStore.updateDraft(seed.id, { title: '第二版' });
    await exhibitionStore.publishExhibition(seed.id);
    await exhibitionStore.updateDraft(seed.id, { title: '未发布的草稿' });

    const reloaded = await loadStores();
    const current = reloaded.exhibitionStore.getById(seed.id)!;
    expect(current.version).toBe(2);
    expect(current.published?.title).toBe('第二版');
    expect(current.draft.title).toBe('未发布的草稿');
    expect(current.history.map((item) => item.version)).toEqual([2, 1]);

    await reloaded.exhibitionStore.rollbackToVersion(seed.id, 1);
    expect(reloaded.exhibitionStore.getById(seed.id)!.draft.title).toBe('手作纹理常设展');
  });

  it('旧版平铺数据在加载时迁移为草稿 + 线上快照结构', async () => {
    await loadStores();
    const { exhibitionRepository } = await import('@/api/storage');
    await exhibitionRepository.save({
      id: 'exhibition-legacy',
      title: '旧展览',
      intro: '旧结构',
      curator: '旧策展人',
      artifactIds: [],
      themeColor: '#000000',
      backgroundMusicUrl: '',
      status: ExhibitionStatus.Published,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as never);

    const { exhibitionStore } = await loadStores();
    const legacy = exhibitionStore.getById('exhibition-legacy')!;
    expect(legacy.version).toBe(1);
    expect(legacy.published?.title).toBe('旧展览');
    expect(legacy.draft.title).toBe('旧展览');
    expect(legacy.history).toHaveLength(1);
  });
});
