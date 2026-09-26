import { ExhibitionStatus, type Exhibition, type ExhibitionContent, type ExhibitionVersion } from '@/types';

/** 历史版本最多保留条数 */
export const MAX_HISTORY_VERSIONS = 5;

/** 深拷贝一份展览内容，避免草稿与快照共享引用 */
export function cloneContent(content: ExhibitionContent): ExhibitionContent {
  return {
    title: content.title,
    intro: content.intro,
    curator: content.curator,
    artifactIds: [...content.artifactIds],
    themeColor: content.themeColor,
    backgroundMusicUrl: content.backgroundMusicUrl,
    tour: content.tour
      ? {
          name: content.tour.name,
          nodes: content.tour.nodes.map((node) => ({
            ...node,
            cameraPosition: { ...node.cameraPosition },
            targetPosition: { ...node.targetPosition }
          }))
        }
      : null
  };
}

/** 取出版本快照中的内容部分（去掉版本号与发布时间） */
export function contentOf(version: ExhibitionVersion): ExhibitionContent {
  return cloneContent(version);
}

export function createEmptyContent(artifactIds: string[] = []): ExhibitionContent {
  return {
    title: '',
    intro: '',
    curator: '',
    artifactIds,
    themeColor: '#173f35',
    backgroundMusicUrl: '',
    tour: null
  };
}

export function exhibitionStatusOf(exhibition: Exhibition): ExhibitionStatus {
  return exhibition.live ? ExhibitionStatus.Published : ExhibitionStatus.Draft;
}

function normalizeContent(content: ExhibitionContent): string {
  return JSON.stringify({
    title: content.title,
    intro: content.intro,
    curator: content.curator,
    artifactIds: content.artifactIds,
    themeColor: content.themeColor,
    backgroundMusicUrl: content.backgroundMusicUrl ?? '',
    tour: content.tour
  });
}

/** 草稿是否与线上快照不一致（存在未发布修改） */
export function isDraftDirty(exhibition: Exhibition): boolean {
  if (!exhibition.live) return true;
  return normalizeContent(exhibition.draft) !== normalizeContent(exhibition.live);
}
